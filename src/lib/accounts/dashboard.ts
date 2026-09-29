import { personalRating, type PersonalView } from "../personal/snapshots";
import { requireUser, type Ctx } from "./actor";
import { memberships, type ClaimRow, type MembershipRow } from "./claims";
import { rows } from "./db";
import { entryById, entryLabel, eventResult, resultText, tournamentById, tournamentEventById } from "./dataset";

/**
 * The signed-in user's own data. Only public decision reasons are included;
 * admin private notes, provider email, subject, and sessions never are.
 */

export interface DashClaim {
  claim: ClaimRow;
  tournamentName: string;
  tournamentDate: string;
  resultUrl: string | null;
  entryText: string;
  eventName: string;
  resultText: string;
  decisionReason: string | null;
}

export interface DashMembership {
  membership: MembershipRow;
  decisionReason: string | null;
  claims: DashClaim[];
  pendingRequest: { id: string; created_at: string } | null;
}

export interface Dashboard {
  memberships: DashMembership[];
  ratings: { division: string; season: number; view: PersonalView }[];
}

/** Latest user-visible reason per subject. */
async function publicReasons(ctx: Ctx, type: "claim" | "membership", ids: string[]) {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rs = await rows<{ subject_id: string; public_reason: string | null; subject_revision: number }>(
    ctx.db,
    `SELECT subject_id, public_reason, subject_revision FROM verification_decisions
     WHERE subject_type = ? AND subject_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
    [type, ...ids],
  );
  for (const r of rs) if (r.public_reason) out.set(r.subject_id, r.public_reason);
  return out;
}

export async function describeClaim(ctx: Ctx, c: ClaimRow, reason: string | null = null): Promise<DashClaim> {
  const [t, e, ev, res] = await Promise.all([
    tournamentById(ctx.data, c.tournament_id),
    entryById(ctx.data, c.entry_id),
    tournamentEventById(ctx.data, c.tournament_event_id),
    eventResult(ctx.data, c.tournament_id, c.entry_id, c.tournament_event_id),
  ]);
  return {
    claim: c,
    tournamentName: t?.name ?? c.tournament_id,
    tournamentDate: t?.end_date ?? "",
    resultUrl: t?.result_url ?? null,
    entryText: e ? entryLabel(e) : "entry no longer in results",
    eventName: ev?.name ?? c.event_def_id,
    resultText: c.source_state === "missing" ? "no longer in the published results" : resultText(res),
    decisionReason: reason,
  };
}

export async function dashboard(ctx: Ctx): Promise<Dashboard> {
  const actor = await requireUser(ctx);
  const ms = await memberships(ctx, actor.userId);
  const claims = await rows<ClaimRow>(
    ctx.db,
    `SELECT * FROM participation_claims WHERE user_id = ? ORDER BY season DESC, tournament_id, event_def_id`,
    [actor.userId],
  );
  const [mReasons, cReasons, openReqs] = await Promise.all([
    publicReasons(ctx, "membership", ms.map((m) => m.id)),
    publicReasons(ctx, "claim", claims.map((c) => c.id)),
    rows<{ id: string; membership_id: string; created_at: string }>(
      ctx.db,
      `SELECT id, membership_id, created_at FROM verification_requests WHERE user_id = ? AND closed_at IS NULL ORDER BY created_at DESC`,
      [actor.userId],
    ),
  ]);
  const described = await Promise.all(claims.map((c) => describeClaim(ctx, c, cReasons.get(c.id) ?? null)));
  const out: DashMembership[] = ms.map((m) => ({
    membership: m,
    decisionReason: mReasons.get(m.id) ?? null,
    claims: described
      .filter((d) => d.claim.membership_id === m.id)
      .sort((a, b) => a.tournamentDate.localeCompare(b.tournamentDate) || a.eventName.localeCompare(b.eventName)),
    pendingRequest: openReqs.find((r) => r.membership_id === m.id) ?? null,
  }));
  const pools = new Map<string, { division: string; season: number }>();
  for (const m of ms) pools.set(`${m.division}${m.season}`, { division: m.division, season: m.season });
  for (const c of claims) pools.set(`${c.division}${c.season}`, { division: c.division, season: c.season });
  const ratings = [];
  for (const p of [...pools.values()].sort((a, b) => b.season - a.season || a.division.localeCompare(b.division))) {
    let view: PersonalView;
    try {
      view = await personalRating(ctx.db, ctx.data, actor.userId, p.division, p.season, ctx.now);
    } catch {
      view = { pending: true, reason: "Rating calculation pending.", snapshot: null };
    }
    ratings.push({ ...p, view });
  }
  return { memberships: out, ratings };
}
