import type { Client } from "@libsql/client";
import { personalRating, type PersonalView } from "../personal/snapshots";
import type { Ctx, DataSource } from "./actor";
import type { ClaimRow, MembershipRow } from "./claims";
import { describeClaim, type DashClaim } from "./dashboard";
import { row, rows } from "./db";

/**
 * Public member data. Only display names, school affiliations, counted
 * claims, and Unofficial USRs of members whose profiles are public — never
 * emails, Google subjects, sessions, private notes, or rejected/revoked items.
 */

/** Affiliation statuses shown publicly (an admin-rejected or revoked one is not). */
const PUBLIC_MEMBERSHIP = ["SELF_REPORTED", "PENDING", "VERIFIED"];
/** Claim statuses shown publicly; only VERIFIED (with an unchanged source) is marked verified. */
const PUBLIC_CLAIM = ["SELF_REPORTED", "PENDING", "VERIFIED"];

export interface SchoolMember {
  userId: string;
  displayName: string;
  division: string;
  season: number;
  verified: boolean;
}

export async function schoolMembers(db: Client, schoolId: string): Promise<{ members: SchoolMember[]; privateCount: number }> {
  const [list, priv] = await Promise.all([
    rows<{ user_id: string; display_name: string; division: string; season: number; status: string }>(
      db,
      `SELECT m.user_id, u.display_name, m.division, m.season, m.status
       FROM school_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.school_id = ? AND m.status IN ('SELF_REPORTED', 'PENDING', 'VERIFIED') AND u.profile_private = 0 AND u.display_name IS NOT NULL
       ORDER BY m.season DESC, m.division, u.display_name COLLATE NOCASE`,
      [schoolId],
    ),
    row<{ n: number }>(
      db,
      `SELECT COUNT(DISTINCT m.user_id) AS n FROM school_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.school_id = ? AND m.status IN ('SELF_REPORTED', 'PENDING', 'VERIFIED') AND u.profile_private = 1`,
      [schoolId],
    ),
  ]);
  return {
    members: list.map((r) => ({ userId: r.user_id, displayName: r.display_name, division: r.division, season: r.season, verified: r.status === "VERIFIED" })),
    privateCount: priv?.n ?? 0,
  };
}

export interface PublicProfile {
  userId: string;
  displayName: string;
  isPrivate: boolean;
  memberships: Pick<MembershipRow, "id" | "school_id" | "school_name" | "division" | "season" | "status">[];
  claims: DashClaim[];
  ratings: { division: string; season: number; view: PersonalView }[];
}

/** A member's profile, or null when it does not exist or is private and the viewer is not its owner. */
export async function publicProfile(db: Client, data: DataSource, userId: string, viewerUserId: string | null, now: Date): Promise<PublicProfile | null> {
  const u = await row<{ id: string; display_name: string | null; profile_private: number }>(
    db,
    `SELECT id, display_name, profile_private FROM users WHERE id = ?`,
    [userId],
  );
  if (!u || !u.display_name) return null;
  const isPrivate = u.profile_private === 1;
  if (isPrivate && viewerUserId !== u.id) return null;
  const ms = await rows<MembershipRow>(
    db,
    `SELECT * FROM school_memberships WHERE user_id = ? AND status IN (${PUBLIC_MEMBERSHIP.map(() => "?").join(",")}) ORDER BY season DESC, division`,
    [u.id, ...PUBLIC_MEMBERSHIP],
  );
  const claims = await rows<ClaimRow>(
    db,
    `SELECT * FROM participation_claims WHERE user_id = ? AND source_state <> 'missing' AND status IN (${PUBLIC_CLAIM.map(() => "?").join(",")})
     ORDER BY season DESC, tournament_id, event_def_id`,
    [u.id, ...PUBLIC_CLAIM],
  );
  const ctx = { db, data, now, sessionToken: null } as Ctx;
  const described = await Promise.all(claims.map((c) => describeClaim(ctx, c)));
  described.sort((a, b) => b.tournamentDate.localeCompare(a.tournamentDate) || a.eventName.localeCompare(b.eventName));
  const pools = new Map<string, { division: string; season: number }>();
  for (const c of claims) pools.set(`${c.division}${c.season}`, { division: c.division, season: c.season });
  const ratings = [];
  for (const p of [...pools.values()].sort((a, b) => b.season - a.season || a.division.localeCompare(b.division))) {
    let view: PersonalView;
    try {
      view = await personalRating(db, data, u.id, p.division, p.season, now);
    } catch {
      view = { pending: true, reason: "Rating calculation pending.", snapshot: null };
    }
    ratings.push({ ...p, view });
  }
  return {
    userId: u.id,
    displayName: u.display_name,
    isPrivate,
    memberships: ms.map((m) => ({ id: m.id, school_id: m.school_id, school_name: m.school_name, division: m.division, season: m.season, status: m.status })),
    claims: described,
    ratings,
  };
}
