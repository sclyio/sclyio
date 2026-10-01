import type { Transaction } from "@libsql/client";
import { recomputePersonal } from "../personal/snapshots";
import { requireUser, type Actor, type Ctx } from "./actor";
import { audit } from "./audit";
import { newId, row, rows, run, tx } from "./db";
import { entryById, schoolById, schoolSeasons, sourceSnapshot, tournamentById, tournamentEventById } from "./dataset";
import { ConflictError, ValidationError } from "./errors";

/**
 * User-side operations. Every operation authenticates from the session,
 * checks ownership, re-validates all dataset references on the server, and
 * enforces the status transitions below.
 */

export const CLAIM_STATUSES = ["SELF_REPORTED", "PENDING", "VERIFIED", "REJECTED", "REVOKED", "WITHDRAWN"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export type MembershipStatus = Exclude<ClaimStatus, "WITHDRAWN">;

/**
 * Allowed transitions (anything else is refused):
 *   request   SELF_REPORTED | REJECTED | REVOKED -> PENDING          (owner)
 *   withdraw  any but WITHDRAWN -> WITHDRAWN                         (owner, claims only)
 *   edit      any but WITHDRAWN -> SELF_REPORTED, revision + 1       (owner)
 *   readd     WITHDRAWN -> SELF_REPORTED, revision + 1               (owner)
 *   verify    SELF_REPORTED | PENDING | REJECTED | REVOKED -> VERIFIED  (admin)
 *   reject    SELF_REPORTED | PENDING -> REJECTED                    (admin)
 *   revoke    VERIFIED -> REVOKED                                    (admin)
 * The admin may decide on items nobody submitted (e.g. past seasons' records)
 * and may reverse an earlier rejection or revocation.
 */
export const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  request: { from: ["SELF_REPORTED", "REJECTED", "REVOKED"], to: "PENDING" },
  withdraw: { from: ["SELF_REPORTED", "PENDING", "VERIFIED", "REJECTED", "REVOKED"], to: "WITHDRAWN" },
  edit: { from: ["SELF_REPORTED", "PENDING", "VERIFIED", "REJECTED", "REVOKED"], to: "SELF_REPORTED" },
  readd: { from: ["WITHDRAWN"], to: "SELF_REPORTED" },
  verify: { from: ["SELF_REPORTED", "PENDING", "REJECTED", "REVOKED"], to: "VERIFIED" },
  reject: { from: ["SELF_REPORTED", "PENDING"], to: "REJECTED" },
  revoke: { from: ["VERIFIED"], to: "REVOKED" },
};

export function canTransition(action: keyof typeof TRANSITIONS, from: string): boolean {
  return TRANSITIONS[action]?.from.includes(from) ?? false;
}

const MAX_EVENTS_PER_SUBMISSION = 30;
export const MAX_EXPLANATION = 500;

/* ------------------------------------------------------------------ */
/* Profile and onboarding                                             */
/* ------------------------------------------------------------------ */

export function cleanDisplayName(raw: unknown): string {
  const name = String(raw ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 2 || name.length > 40) throw new ValidationError("Display name must be 2 to 40 characters.");
  if (/[\u0000-\u001f\u007f<>]/.test(name)) throw new ValidationError("Display name contains characters that are not allowed.");
  if (/@/.test(name)) throw new ValidationError("Please do not use an email address as your display name.");
  return name;
}

/** Cosmetic: never changes membership or claim verification. */
export async function setDisplayName(ctx: Ctx, rawName: unknown) {
  const actor = await requireUser(ctx, { mutation: true });
  const name = cleanDisplayName(rawName);
  const at = ctx.now.toISOString();
  await run(ctx.db, `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`, [name, at, actor.userId]);
  await run(
    ctx.db,
    `UPDATE users SET onboarded_at = ? WHERE id = ? AND onboarded_at IS NULL AND EXISTS (SELECT 1 FROM school_memberships WHERE user_id = users.id)`,
    [at, actor.userId],
  );
  await audit(ctx.db, { at, actorUserId: actor.userId, subjectType: "user", subjectId: actor.userId, action: "display_name" });
  return name;
}

export interface MembershipRow {
  id: string;
  user_id: string;
  school_id: string;
  school_name: string;
  division: string;
  season: number;
  revision: number;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Attach the user to an existing school for one or more whole division/season
 * pairs (each starts unverified), all or nothing. Members can add any number
 * of seasons, and different schools in different seasons, but only one school
 * per season (both divisions at that one school are allowed). There are no
 * partial seasons.
 */
export async function joinSchoolSeasons(ctx: Ctx, input: { schoolId: unknown; seasons: unknown[] }): Promise<string[]> {
  const actor = await requireUser(ctx, { mutation: true });
  if (!input.seasons.length) throw new ValidationError("Select at least one season.");
  if (input.seasons.length > 60) throw new ValidationError("Too many seasons selected.");
  if (typeof input.schoolId !== "string" || !input.schoolId) throw new ValidationError("Choose a school.");
  const school = await schoolById(ctx.data, input.schoolId);
  if (!school) throw new ValidationError("That school is not in the imported results.");
  const available = await schoolSeasons(ctx.data, school.id);
  // Each pick is "C:2026" (division:season).
  const picks = [...new Set(input.seasons.map((x) => String(x)))].map((x) => {
    const [division, raw] = x.split(":");
    if (division !== "B" && division !== "C") throw new ValidationError("Choose Division B or C.");
    const season = Number(raw);
    if (!Number.isInteger(season)) throw new ValidationError("Choose a season.");
    if (!available.some((y) => y.division === division && y.season === season)) {
      throw new ValidationError(`${school.name} has no imported Division ${division} results for ${season - 1}-${String(season).slice(2)}.`);
    }
    return { division: division as "B" | "C", season };
  });
  picks.sort((x, y) => x.season - y.season || x.division.localeCompare(y.division));
  const at = ctx.now.toISOString();
  return tx(ctx.db, async (t) => {
    const ids: string[] = [];
    for (const { division, season } of picks) {
      const label = `${season - 1}-${String(season).slice(2)}`;
      const other = await row<{ school_name: string }>(
        t,
        `SELECT school_name FROM school_memberships WHERE user_id = ? AND season = ? AND school_id <> ?`,
        [actor.userId, season, school.id],
      );
      if (other) {
        throw new ConflictError(`You are already affiliated with ${other.school_name} for ${label}. You can only be at one school per season.`);
      }
      const dup = await row(t, `SELECT id FROM school_memberships WHERE user_id = ? AND school_id = ? AND division = ? AND season = ?`, [
        actor.userId,
        school.id,
        division,
        season,
      ]);
      if (dup) throw new ConflictError(`You already have Division ${division} ${label} at this school.`);
      const id = newId("mem");
      await run(
        t,
        `INSERT INTO school_memberships (id, user_id, school_id, school_name, division, season, revision, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'SELF_REPORTED', ?, ?)`,
        [id, actor.userId, school.id, school.name, division, season, at, at],
      );
      await audit(t, { at, actorUserId: actor.userId, subjectType: "membership", subjectId: id, revision: 1, action: "create", toStatus: "SELF_REPORTED" });
      ids.push(id);
    }
    await markOnboarded(t, actor, at);
    return ids;
  });
}

/** One division and season (see joinSchoolSeasons). */
export async function joinSchool(ctx: Ctx, input: { schoolId: unknown; division: unknown; season: unknown }): Promise<string> {
  const [id] = await joinSchoolSeasons(ctx, { schoolId: input.schoolId, seasons: [`${String(input.division)}:${String(input.season)}`] });
  return id;
}

async function markOnboarded(t: Transaction, actor: Actor, at: string) {
  await run(t, `UPDATE users SET onboarded_at = ? WHERE id = ? AND onboarded_at IS NULL AND display_name IS NOT NULL`, [at, actor.userId]);
}

/** Public profile (default) or private: private members appear nowhere public. */
export async function setProfilePrivacy(ctx: Ctx, isPrivate: boolean) {
  const actor = await requireUser(ctx, { mutation: true });
  const at = ctx.now.toISOString();
  await run(ctx.db, `UPDATE users SET profile_private = ?, updated_at = ? WHERE id = ?`, [isPrivate ? 1 : 0, at, actor.userId]);
  await audit(ctx.db, { at, actorUserId: actor.userId, subjectType: "user", subjectId: actor.userId, action: isPrivate ? "profile_private" : "profile_public" });
}

export async function ownMembership(ctx: Ctx, actor: Actor, membershipId: unknown): Promise<MembershipRow> {
  if (typeof membershipId !== "string") throw new ValidationError("Choose a school affiliation.");
  const m = await row<MembershipRow>(ctx.db, `SELECT * FROM school_memberships WHERE id = ?`, [membershipId]);
  // Another user's membership looks exactly like a missing one.
  if (!m || m.user_id !== actor.userId) throw new ValidationError("That school affiliation was not found.");
  return m;
}

export const memberships = (ctx: Ctx, userId: string) =>
  rows<MembershipRow>(ctx.db, `SELECT * FROM school_memberships WHERE user_id = ? ORDER BY season DESC, division, created_at`, [userId]);

/* ------------------------------------------------------------------ */
/* Participation claims                                               */
/* ------------------------------------------------------------------ */

export interface ClaimRow {
  id: string;
  user_id: string;
  membership_id: string;
  school_id: string;
  division: string;
  season: number;
  tournament_id: string;
  entry_id: string;
  tournament_event_id: string;
  event_def_id: string;
  revision: number;
  status: ClaimStatus;
  request_id: string | null;
  source_hash: string;
  source_state: string;
  created_at: string;
  updated_at: string;
}

/** Server-side check that membership, school, entry, tournament, season/division, and event all agree. */
async function validateClaimTarget(ctx: Ctx, m: MembershipRow, tournamentId: unknown, entryId: unknown, eventIds: unknown[]) {
  if (typeof tournamentId !== "string" || !tournamentId) throw new ValidationError("Choose a tournament.");
  if (typeof entryId !== "string" || !entryId) throw new ValidationError("Choose your team entry.");
  const tournament = await tournamentById(ctx.data, tournamentId);
  if (!tournament) throw new ValidationError("That tournament is not in the imported results.");
  if (tournament.division !== m.division || tournament.season !== m.season) {
    throw new ValidationError(`That tournament is not a Division ${m.division} tournament in your affiliation's season.`);
  }
  const entry = await entryById(ctx.data, entryId);
  if (!entry || entry.tournament_id !== tournament.id) throw new ValidationError("That team entry is not part of this tournament.");
  if (entry.school_id !== m.school_id) throw new ValidationError(`That team entry does not belong to ${m.school_name}.`);
  if (!eventIds.length) throw new ValidationError("Select at least one event you competed in.");
  if (eventIds.length > MAX_EVENTS_PER_SUBMISSION) throw new ValidationError("Too many events selected.");
  if (new Set(eventIds).size !== eventIds.length) throw new ValidationError("An event was selected twice.");
  const events = [];
  for (const id of eventIds) {
    if (typeof id !== "string") throw new ValidationError("Invalid event.");
    const ev = await tournamentEventById(ctx.data, id);
    if (!ev || ev.tournament_id !== tournament.id) throw new ValidationError("A selected event is not part of this tournament.");
    events.push(ev);
  }
  return { tournament, entry, events };
}

/**
 * Add one claim per selected event (declaring participation on one team
 * entry). Claims start SELF_REPORTED and count toward the unofficial rating
 * immediately. A previously withdrawn claim for the same event is revived as
 * a new revision.
 */
export async function addClaims(
  ctx: Ctx,
  input: { membershipId: unknown; tournamentId: unknown; entryId: unknown; tournamentEventIds: unknown[] },
): Promise<string[]> {
  const actor = await requireUser(ctx, { mutation: true });
  const m = await ownMembership(ctx, actor, input.membershipId);
  const { tournament, entry, events } = await validateClaimTarget(ctx, m, input.tournamentId, input.entryId, input.tournamentEventIds);
  const hashes = new Map<string, string>();
  for (const ev of events) {
    hashes.set(ev.id, (await sourceSnapshot(ctx.data, { tournament_id: tournament.id, entry_id: entry.id, tournament_event_id: ev.id })).hash);
  }
  const at = ctx.now.toISOString();
  const ids = await tx(ctx.db, async (t) => {
    const out: string[] = [];
    for (const ev of events) {
      const existing = await row<ClaimRow>(t, `SELECT * FROM participation_claims WHERE user_id = ? AND tournament_id = ? AND tournament_event_id = ?`, [
        actor.userId,
        tournament.id,
        ev.id,
      ]);
      if (existing && existing.status !== "WITHDRAWN") {
        throw new ConflictError(
          existing.entry_id === entry.id
            ? `You already claimed ${ev.name} at this tournament.`
            : `You already claimed ${ev.name} at this tournament on a different team entry. Edit or withdraw that claim first.`,
        );
      }
      if (existing) {
        const n = await run(
          t,
          `UPDATE participation_claims SET membership_id = ?, school_id = ?, entry_id = ?, event_def_id = ?, revision = revision + 1,
             status = 'SELF_REPORTED', request_id = NULL, source_hash = ?, source_state = 'current', updated_at = ?
           WHERE id = ? AND revision = ? AND status = 'WITHDRAWN'`,
          [m.id, m.school_id, entry.id, ev.event_def_id, hashes.get(ev.id)!, at, existing.id, existing.revision],
        );
        if (!n) throw new ConflictError("A claim changed while saving. Reload and try again.");
        await audit(t, { at, actorUserId: actor.userId, subjectType: "claim", subjectId: existing.id, revision: existing.revision + 1, action: "readd", fromStatus: "WITHDRAWN", toStatus: "SELF_REPORTED", detail: { entryId: entry.id, tournamentEventId: ev.id } });
        out.push(existing.id);
        continue;
      }
      const id = newId("clm");
      await run(
        t,
        `INSERT INTO participation_claims (id, user_id, membership_id, school_id, division, season, tournament_id, entry_id, tournament_event_id,
           event_def_id, revision, status, source_hash, source_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'SELF_REPORTED', ?, 'current', ?, ?)`,
        [id, actor.userId, m.id, m.school_id, m.division, m.season, tournament.id, entry.id, ev.id, ev.event_def_id, hashes.get(ev.id)!, at, at],
      );
      await audit(t, { at, actorUserId: actor.userId, subjectType: "claim", subjectId: id, revision: 1, action: "create", toStatus: "SELF_REPORTED", detail: { entryId: entry.id, tournamentEventId: ev.id } });
      out.push(id);
    }
    return out;
  });
  await recomputeQuietly(ctx, actor.userId, m.division, m.season);
  return ids;
}

async function ownClaim(ctx: Ctx, actor: Actor, claimId: unknown): Promise<ClaimRow> {
  if (typeof claimId !== "string") throw new ValidationError("Claim not found.");
  const c = await row<ClaimRow>(ctx.db, `SELECT * FROM participation_claims WHERE id = ?`, [claimId]);
  if (!c || c.user_id !== actor.userId) throw new ValidationError("Claim not found.");
  return c;
}

export async function claimForOwner(ctx: Ctx, claimId: string) {
  const actor = await requireUser(ctx);
  return ownClaim(ctx, actor, claimId);
}

/**
 * Change the team entry and/or event of a claim (same tournament). Any real
 * change creates a new revision and resets verification to SELF_REPORTED.
 */
export async function editClaim(ctx: Ctx, input: { claimId: unknown; revision: unknown; entryId: unknown; tournamentEventId: unknown }) {
  const actor = await requireUser(ctx, { mutation: true });
  const c = await ownClaim(ctx, actor, input.claimId);
  if (Number(input.revision) !== c.revision) throw new ConflictError("This claim changed since you opened it. Reload and try again.");
  if (!canTransition("edit", c.status)) throw new ConflictError("Withdrawn claims cannot be edited; add the event again instead.");
  const m = await ownMembership(ctx, actor, c.membership_id);
  const { entry, events } = await validateClaimTarget(ctx, m, c.tournament_id, input.entryId, [input.tournamentEventId]);
  const ev = events[0];
  if (entry.id === c.entry_id && ev.id === c.tournament_event_id) return c.id;
  const hash = (await sourceSnapshot(ctx.data, { tournament_id: c.tournament_id, entry_id: entry.id, tournament_event_id: ev.id })).hash;
  const at = ctx.now.toISOString();
  await tx(ctx.db, async (t) => {
    if (ev.id !== c.tournament_event_id) {
      const clash = await row<{ status: string }>(
        t,
        `SELECT status FROM participation_claims WHERE user_id = ? AND tournament_id = ? AND tournament_event_id = ? AND id <> ?`,
        [actor.userId, c.tournament_id, ev.id, c.id],
      );
      if (clash && clash.status !== "WITHDRAWN") throw new ConflictError(`You already claimed ${ev.name} at this tournament.`);
      if (clash) {
        throw new ConflictError(`You have a withdrawn claim for ${ev.name} here; add it again from “Add competition” instead.`);
      }
    }
    const n = await run(
      t,
      `UPDATE participation_claims SET entry_id = ?, tournament_event_id = ?, event_def_id = ?, revision = revision + 1, status = 'SELF_REPORTED',
         request_id = NULL, source_hash = ?, source_state = 'current', updated_at = ?
       WHERE id = ? AND user_id = ? AND revision = ?`,
      [entry.id, ev.id, ev.event_def_id, hash, at, c.id, actor.userId, c.revision],
    );
    if (!n) throw new ConflictError("This claim changed since you opened it. Reload and try again.");
    await audit(t, {
      at,
      actorUserId: actor.userId,
      subjectType: "claim",
      subjectId: c.id,
      revision: c.revision + 1,
      action: "edit",
      fromStatus: c.status,
      toStatus: "SELF_REPORTED",
      detail: { from: { entryId: c.entry_id, tournamentEventId: c.tournament_event_id }, to: { entryId: entry.id, tournamentEventId: ev.id } },
    });
    await closeFinishedRequests(t, c.request_id, at);
  });
  await recomputeQuietly(ctx, actor.userId, c.division, c.season);
  return c.id;
}

export async function withdrawClaim(ctx: Ctx, input: { claimId: unknown }) {
  const actor = await requireUser(ctx, { mutation: true });
  const c = await ownClaim(ctx, actor, input.claimId);
  if (!canTransition("withdraw", c.status)) throw new ConflictError("This claim is already withdrawn.");
  const at = ctx.now.toISOString();
  await tx(ctx.db, async (t) => {
    const n = await run(
      t,
      `UPDATE participation_claims SET status = 'WITHDRAWN', request_id = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ? AND status = ?`,
      [at, c.id, actor.userId, c.revision, c.status],
    );
    if (!n) throw new ConflictError("This claim changed. Reload and try again.");
    await audit(t, { at, actorUserId: actor.userId, subjectType: "claim", subjectId: c.id, revision: c.revision, action: "withdraw", fromStatus: c.status, toStatus: "WITHDRAWN" });
    await closeFinishedRequests(t, c.request_id, at);
  });
  await recomputeQuietly(ctx, actor.userId, c.division, c.season);
}

/**
 * Ask for manual review of an affiliation and/or claims. Moves each
 * selected item to PENDING and groups them into one submission.
 */
export async function requestVerification(
  ctx: Ctx,
  input: { membershipId: unknown; includeMembership: unknown; claimIds: unknown[]; explanation: unknown },
) {
  const actor = await requireUser(ctx, { mutation: true });
  const m = await ownMembership(ctx, actor, input.membershipId);
  const includeMembership = input.includeMembership === true || input.includeMembership === "on" || input.includeMembership === "1";
  const explanation = String(input.explanation ?? "").trim();
  if (explanation.length > MAX_EXPLANATION) throw new ValidationError(`Keep the explanation under ${MAX_EXPLANATION} characters.`);
  const ids = [...new Set(input.claimIds.map(String))];
  const claims: ClaimRow[] = [];
  for (const id of ids) {
    const c = await ownClaim(ctx, actor, id);
    if (c.membership_id !== m.id) throw new ValidationError("A selected claim belongs to a different school affiliation.");
    if (!canTransition("request", c.status)) throw new ConflictError("A selected claim is already pending, verified, or withdrawn.");
    claims.push(c);
  }
  if (includeMembership && !canTransition("request", m.status)) throw new ConflictError("This affiliation is already pending or verified.");
  if (!includeMembership && !claims.length) throw new ValidationError("Select your affiliation or at least one claim to review.");
  const at = ctx.now.toISOString();
  const requestId = newId("req");
  await tx(ctx.db, async (t) => {
    await run(
      t,
      `INSERT INTO verification_requests (id, user_id, membership_id, include_membership, explanation, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [requestId, actor.userId, m.id, includeMembership ? 1 : 0, explanation || null, at],
    );
    if (includeMembership) {
      const n = await run(t, `UPDATE school_memberships SET status = 'PENDING', updated_at = ? WHERE id = ? AND revision = ? AND status = ?`, [
        at,
        m.id,
        m.revision,
        m.status,
      ]);
      if (!n) throw new ConflictError("Your affiliation changed. Reload and try again.");
      await audit(t, { at, actorUserId: actor.userId, subjectType: "membership", subjectId: m.id, revision: m.revision, action: "request", fromStatus: m.status, toStatus: "PENDING", detail: { requestId } });
    }
    for (const c of claims) {
      const n = await run(
        t,
        `UPDATE participation_claims SET status = 'PENDING', request_id = ?, updated_at = ? WHERE id = ? AND revision = ? AND status = ?`,
        [requestId, at, c.id, c.revision, c.status],
      );
      if (!n) throw new ConflictError("A claim changed. Reload and try again.");
      await audit(t, { at, actorUserId: actor.userId, subjectType: "claim", subjectId: c.id, revision: c.revision, action: "request", fromStatus: c.status, toStatus: "PENDING", detail: { requestId } });
    }
  });
  await recomputeQuietly(ctx, actor.userId, m.division, m.season);
  return requestId;
}

/** Close a submission once nothing in it is pending any more. */
export async function closeFinishedRequests(t: Transaction, requestId: string | null, at: string) {
  if (!requestId) return;
  const open = await row<{ c: number }>(
    t,
    `SELECT (SELECT COUNT(*) FROM participation_claims WHERE request_id = @id AND status = 'PENDING')
          + (SELECT COUNT(*) FROM verification_requests r JOIN school_memberships m ON m.id = r.membership_id
             WHERE r.id = @id AND r.include_membership = 1 AND m.status = 'PENDING') AS c`,
    { id: requestId },
  );
  if (!open?.c) await run(t, `UPDATE verification_requests SET closed_at = ? WHERE id = ? AND closed_at IS NULL`, [at, requestId]);
}

/** Recompute after a committed change. A failure leaves a visible "pending" state, never a stale score. */
export async function recomputeQuietly(ctx: Ctx, userId: string, division: string, season: number) {
  try {
    await recomputePersonal(ctx.db, ctx.data, userId, division, season, ctx.now);
  } catch {
    // personalRating() recomputes (or reports pending) on the next read.
  }
}
