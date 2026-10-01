import { requireAdmin, type Actor, type Ctx } from "./actor";
import { audit } from "./audit";
import { canTransition, closeFinishedRequests, recomputeQuietly, type ClaimRow, type MembershipRow } from "./claims";
import { newId, row, rows, run, tx } from "./db";
import { entryLabel, resultText, sourceSnapshot, type SourceSnapshot } from "./dataset";
import { AccessError, ConflictError, isDomainError, ValidationError } from "./errors";
import { refreshClaimSources } from "./sources";

/**
 * Admin verification console. Every function here passes requireAdmin();
 * decisions additionally need a fresh Google sign-in and CSRF token, bind to
 * the exact revision reviewed, and refuse to review the admin's own records.
 */

export type Decision = "VERIFIED" | "REJECTED" | "REVOKED";
const ACTION: Record<Decision, "verify" | "reject" | "revoke"> = { VERIFIED: "verify", REJECTED: "reject", REVOKED: "revoke" };
const MAX_REASON = 1000;

/** Review heuristics — flags for a human, not competition rules. */
export const FLAG_MANY_PARTNERS = 3; // more than this many users on one team-event result
export const FLAG_MANY_EVENTS = 8; // more than this many events claimed at one tournament

export interface QueueFilters {
  state?: "open" | "closed" | "all";
  claimStatus?: string;
  division?: string;
  season?: number;
  q?: string;
}

export interface QueueClaim {
  claim: ClaimRow;
  source: SourceSnapshot;
  tournamentName: string;
  tournamentDate: string;
  resultUrl: string | null;
  entryText: string;
  eventName: string;
  resultText: string;
  flags: string[];
  partners: string[];
  history: HistoryItem[];
}

export interface HistoryItem {
  at: string;
  action: string;
  revision: number | null;
  fromStatus: string | null;
  toStatus: string | null;
  actor: string | null;
  publicReason?: string | null;
  privateNote?: string | null;
}

export interface QueueItem {
  request: { id: string; created_at: string; closed_at: string | null; explanation: string | null; include_membership: number };
  user: { id: string; displayName: string | null };
  membership: MembershipRow;
  membershipHistory: HistoryItem[];
  claims: QueueClaim[];
}

async function historyFor(ctx: Ctx, type: "claim" | "membership", id: string): Promise<HistoryItem[]> {
  const [log, decisions] = await Promise.all([
    rows<Record<string, unknown>>(
      ctx.db,
      `SELECT a.at, a.action, a.revision, a.from_status, a.to_status, u.display_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.subject_type = ? AND a.subject_id = ? ORDER BY a.id`,
      [type, id],
    ),
    rows<Record<string, unknown>>(
      ctx.db,
      `SELECT created_at, decision, subject_revision, public_reason, private_note FROM verification_decisions
       WHERE subject_type = ? AND subject_id = ? ORDER BY created_at`,
      [type, id],
    ),
  ]);
  const items: HistoryItem[] = log
    .filter((r) => !["verify", "reject", "revoke"].includes(r.action as string))
    .map((r) => ({
      at: r.at as string,
      action: r.action as string,
      revision: (r.revision as number | null) ?? null,
      fromStatus: (r.from_status as string | null) ?? null,
      toStatus: (r.to_status as string | null) ?? null,
      actor: (r.display_name as string | null) ?? null,
    }));
  for (const d of decisions) {
    items.push({
      at: d.created_at as string,
      action: `admin ${String(d.decision).toLowerCase()}`,
      revision: d.subject_revision as number,
      fromStatus: null,
      toStatus: d.decision as string,
      actor: "admin",
      publicReason: (d.public_reason as string | null) ?? null,
      privateNote: (d.private_note as string | null) ?? null,
    });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Everything the reviewer sees about one claim: the official result, partners, flags, and history. */
async function reviewClaim(ctx: Ctx, c: ClaimRow): Promise<QueueClaim> {
  const source = await sourceSnapshot(ctx.data, c);
  const [partnerRows, perTournament] = await Promise.all([
    rows<{ display_name: string | null }>(
      ctx.db,
      `SELECT u.display_name FROM participation_claims c JOIN users u ON u.id = c.user_id
       WHERE c.entry_id = ? AND c.tournament_event_id = ? AND c.user_id <> ? AND c.status <> 'WITHDRAWN'`,
      [c.entry_id, c.tournament_event_id, c.user_id],
    ),
    row<{ n: number }>(
      ctx.db,
      `SELECT COUNT(*) AS n FROM participation_claims WHERE user_id = ? AND tournament_id = ? AND status <> 'WITHDRAWN'`,
      [c.user_id, c.tournament_id],
    ),
  ]);
  const flags: string[] = [];
  if (partnerRows.length + 1 > FLAG_MANY_PARTNERS) flags.push(`${partnerRows.length + 1} users claim this team-event result`);
  if ((perTournament?.n ?? 0) > FLAG_MANY_EVENTS) flags.push(`${perTournament!.n} events claimed at this tournament`);
  if (c.source_state === "changed") flags.push("official result changed since it was verified");
  if (c.source_state === "missing") flags.push("official result no longer in the published results");
  if (source.entry?.exhibition) flags.push("exhibition entry");
  if (source.entry?.resolution === "unresolved") flags.push("entry identity unresolved");
  return {
    claim: c,
    source,
    tournamentName: source.tournament?.name ?? c.tournament_id,
    tournamentDate: source.tournament?.end_date ?? "",
    resultUrl: source.tournament?.result_url ?? null,
    entryText: source.entry ? `${source.entry.raw_school} ${entryLabel(source.entry)}` : c.entry_id,
    eventName: source.event?.name ?? c.event_def_id,
    resultText: source.missing ? "missing from published results" : resultText(source.result),
    flags,
    partners: partnerRows.map((p) => p.display_name ?? "(no name)"),
    history: await historyFor(ctx, "claim", c.id),
  };
}

export async function adminQueue(ctx: Ctx, f: QueueFilters = {}): Promise<QueueItem[]> {
  await requireAdmin(ctx);
  const where: string[] = ["1=1"];
  const args: Record<string, string | number> = {};
  if ((f.state ?? "open") === "open") where.push("r.closed_at IS NULL");
  if (f.state === "closed") where.push("r.closed_at IS NOT NULL");
  if (f.division) {
    where.push("m.division = @division");
    args.division = f.division;
  }
  if (f.season) {
    where.push("m.season = @season");
    args.season = f.season;
  }
  if (f.q) {
    where.push("(m.school_name LIKE @q OR u.display_name LIKE @q)");
    args.q = `%${f.q.trim()}%`;
  }
  if (f.claimStatus) {
    where.push("EXISTS (SELECT 1 FROM participation_claims c WHERE c.request_id = r.id AND c.status = @cs)");
    args.cs = f.claimStatus;
  }
  const reqs = await rows<Record<string, unknown>>(
    ctx.db,
    `SELECT r.id, r.created_at, r.closed_at, r.explanation, r.include_membership, r.user_id, u.display_name, r.membership_id
     FROM verification_requests r JOIN users u ON u.id = r.user_id JOIN school_memberships m ON m.id = r.membership_id
     WHERE ${where.join(" AND ")} ORDER BY r.closed_at IS NOT NULL, r.created_at LIMIT 50`,
    args,
  );
  const out: QueueItem[] = [];
  for (const r of reqs) {
    const membership = (await row<MembershipRow>(ctx.db, `SELECT * FROM school_memberships WHERE id = ?`, [r.membership_id as string]))!;
    const claims = await rows<ClaimRow>(ctx.db, `SELECT * FROM participation_claims WHERE request_id = ? ORDER BY tournament_id, event_def_id`, [
      r.id as string,
    ]);
    // Source corrections since the claim was reviewed show up here.
    await refreshClaimSources(ctx.db, ctx.data, claims, ctx.now);
    const qc: QueueClaim[] = [];
    for (const c of claims) qc.push(await reviewClaim(ctx, c));
    out.push({
      request: {
        id: r.id as string,
        created_at: r.created_at as string,
        closed_at: (r.closed_at as string | null) ?? null,
        explanation: (r.explanation as string | null) ?? null,
        include_membership: r.include_membership as number,
      },
      user: { id: r.user_id as string, displayName: (r.display_name as string | null) ?? null },
      membership,
      membershipHistory: await historyFor(ctx, "membership", membership.id),
      claims: qc,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Records: every affiliation and claim, any season, submitted or not  */
/* ------------------------------------------------------------------ */

export const RECORDS_PAGE_SIZE = 25;

export interface RecordFilters {
  /** "unverified" (default): anything still self-reported or pending; "any"; or one exact status. */
  status?: string;
  division?: string;
  season?: number;
  q?: string;
  page?: number;
}

export interface RecordItem {
  user: { id: string; displayName: string | null };
  membership: MembershipRow;
  membershipHistory: HistoryItem[];
  claims: QueueClaim[];
  /** The open submission covering this affiliation, if any. */
  openRequestId: string | null;
}

/**
 * Browse affiliations with their claims regardless of whether the member
 * ever requested review, so the admin can verify any season's records. The
 * admin's own records are left out (they cannot be reviewed by the admin).
 */
export async function adminRecords(ctx: Ctx, f: RecordFilters = {}): Promise<{ items: RecordItem[]; hasMore: boolean }> {
  const actor = await requireAdmin(ctx);
  const where: string[] = ["m.user_id <> @me"];
  const args: Record<string, string | number> = { me: actor.userId };
  const status = f.status ?? "unverified";
  if (status === "unverified") {
    where.push(`(m.status IN ('SELF_REPORTED', 'PENDING')
      OR EXISTS (SELECT 1 FROM participation_claims c WHERE c.membership_id = m.id AND c.status IN ('SELF_REPORTED', 'PENDING')))`);
  } else if (status !== "any") {
    where.push("(m.status = @st OR EXISTS (SELECT 1 FROM participation_claims c WHERE c.membership_id = m.id AND c.status = @st))");
    args.st = status;
  }
  if (f.division) {
    where.push("m.division = @division");
    args.division = f.division;
  }
  if (f.season) {
    where.push("m.season = @season");
    args.season = f.season;
  }
  if (f.q) {
    where.push("(m.school_name LIKE @q OR u.display_name LIKE @q)");
    args.q = `%${f.q.trim()}%`;
  }
  const page = Math.max(1, Math.floor(f.page ?? 1));
  args.limit = RECORDS_PAGE_SIZE + 1;
  args.offset = (page - 1) * RECORDS_PAGE_SIZE;
  const ms = await rows<MembershipRow & { display_name: string | null }>(
    ctx.db,
    `SELECT m.*, u.display_name FROM school_memberships m JOIN users u ON u.id = m.user_id
     WHERE ${where.join(" AND ")} ORDER BY m.season DESC, m.division, m.school_name, u.display_name, m.id LIMIT @limit OFFSET @offset`,
    args,
  );
  const items: RecordItem[] = [];
  for (const { display_name, ...membership } of ms.slice(0, RECORDS_PAGE_SIZE)) {
    const claims = await rows<ClaimRow>(
      ctx.db,
      `SELECT * FROM participation_claims WHERE membership_id = ? AND status <> 'WITHDRAWN' ORDER BY tournament_id, event_def_id`,
      [membership.id],
    );
    await refreshClaimSources(ctx.db, ctx.data, claims, ctx.now);
    const qc: QueueClaim[] = [];
    for (const c of claims) qc.push(await reviewClaim(ctx, c));
    const open = await row<{ id: string }>(
      ctx.db,
      `SELECT id FROM verification_requests WHERE membership_id = ? AND closed_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [membership.id],
    );
    items.push({
      user: { id: membership.user_id, displayName: display_name },
      membership,
      membershipHistory: await historyFor(ctx, "membership", membership.id),
      claims: qc,
      openRequestId: open?.id ?? null,
    });
  }
  return { items, hasMore: ms.length > RECORDS_PAGE_SIZE };
}

export interface SeasonSummary {
  season: number;
  division: string;
  affiliations: number;
  affiliationsVerified: number;
  affiliationsUnverified: number;
  claims: number;
  claimsVerified: number;
  claimsUnverified: number;
  claimsPending: number;
}

/** Per division/season counts for the admin overview, newest season first. */
export async function adminSeasonSummary(ctx: Ctx): Promise<{ seasons: SeasonSummary[]; openRequests: number }> {
  const actor = await requireAdmin(ctx);
  const [ms, cs, open] = await Promise.all([
    rows<{ season: number; division: string; n: number; v: number; u: number }>(
      ctx.db,
      `SELECT season, division, COUNT(*) AS n, SUM(status = 'VERIFIED') AS v, SUM(status IN ('SELF_REPORTED', 'PENDING')) AS u
       FROM school_memberships WHERE user_id <> ? GROUP BY season, division`,
      [actor.userId],
    ),
    rows<{ season: number; division: string; n: number; v: number; u: number; p: number }>(
      ctx.db,
      `SELECT season, division, COUNT(*) AS n, SUM(status = 'VERIFIED') AS v, SUM(status IN ('SELF_REPORTED', 'PENDING')) AS u,
         SUM(status = 'PENDING') AS p
       FROM participation_claims WHERE status <> 'WITHDRAWN' AND user_id <> ? GROUP BY season, division`,
      [actor.userId],
    ),
    row<{ n: number }>(ctx.db, `SELECT COUNT(*) AS n FROM verification_requests WHERE closed_at IS NULL AND user_id <> ?`, [actor.userId]),
  ]);
  const by = new Map<string, SeasonSummary>();
  const get = (season: number, division: string) => {
    const k = `${season}${division}`;
    if (!by.has(k)) {
      by.set(k, { season, division, affiliations: 0, affiliationsVerified: 0, affiliationsUnverified: 0, claims: 0, claimsVerified: 0, claimsUnverified: 0, claimsPending: 0 });
    }
    return by.get(k)!;
  };
  for (const m of ms) Object.assign(get(m.season, m.division), { affiliations: m.n, affiliationsVerified: m.v, affiliationsUnverified: m.u });
  for (const c of cs) Object.assign(get(c.season, c.division), { claims: c.n, claimsVerified: c.v, claimsUnverified: c.u, claimsPending: c.p });
  const seasons = [...by.values()].sort((a, b) => b.season - a.season || a.division.localeCompare(b.division));
  return { seasons, openRequests: open?.n ?? 0 };
}

function cleanReason(v: unknown, label: string): string | null {
  const s = String(v ?? "").trim();
  if (s.length > MAX_REASON) throw new ValidationError(`${label} is too long.`);
  return s || null;
}

function checkDecision(decision: unknown, publicReason: string | null): Decision {
  if (decision !== "VERIFIED" && decision !== "REJECTED" && decision !== "REVOKED") throw new ValidationError("Choose a decision.");
  if (decision !== "VERIFIED" && !publicReason) throw new ValidationError("A reason visible to the user is required to reject or revoke.");
  return decision;
}

function separationOfDuty(actor: Actor, subjectUserId: string) {
  if (actor.userId === subjectUserId) throw new AccessError("forbidden", "Administrators cannot review their own affiliation or participation.");
}

export interface DecisionInput {
  id: unknown;
  revision: unknown;
  decision: unknown;
  publicReason?: unknown;
  privateNote?: unknown;
}

/** Record a decision on one claim revision. Fails safely if the claim was edited during review. */
export async function decideClaim(ctx: Ctx, input: DecisionInput) {
  const actor = await requireAdmin(ctx, { mutation: true });
  if (typeof input.id !== "string") throw new ValidationError("Claim not found.");
  const c = await row<ClaimRow>(ctx.db, `SELECT * FROM participation_claims WHERE id = ?`, [input.id]);
  if (!c) throw new ValidationError("Claim not found.");
  separationOfDuty(actor, c.user_id);
  const publicReason = cleanReason(input.publicReason, "Reason");
  const privateNote = cleanReason(input.privateNote, "Private note");
  const decision = checkDecision(input.decision, publicReason);
  if (Number(input.revision) !== c.revision) throw new ConflictError("The user edited this claim during review. Reload to review the new revision.");
  if (!canTransition(ACTION[decision], c.status)) throw new ConflictError(`Cannot ${ACTION[decision]} a claim that is ${c.status.toLowerCase()}.`);
  const source = await sourceSnapshot(ctx.data, c);
  if (decision === "VERIFIED" && source.missing) throw new ConflictError("The official result is missing from the published results; it cannot be verified.");
  const at = ctx.now.toISOString();
  await tx(ctx.db, async (t) => {
    // Verifying records the source fingerprint the admin looked at.
    const n = await run(
      t,
      decision === "VERIFIED"
        ? `UPDATE participation_claims SET status = ?, source_hash = ?, source_state = 'current', updated_at = ? WHERE id = ? AND revision = ? AND status = ?`
        : `UPDATE participation_claims SET status = ?, updated_at = ? WHERE id = ? AND revision = ? AND status = ?`,
      decision === "VERIFIED" ? [decision, source.hash, at, c.id, c.revision, c.status] : [decision, at, c.id, c.revision, c.status],
    );
    if (!n) throw new ConflictError("The claim changed during review. Reload to review the new revision.");
    await run(
      t,
      `INSERT INTO verification_decisions (id, subject_type, subject_id, subject_revision, request_id, reviewer_user_id, reviewer_oauth_account_id,
         decision, public_reason, private_note, source_hash, created_at) VALUES (?, 'claim', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId("dec"), c.id, c.revision, c.request_id, actor.userId, actor.oauthAccountId, decision, publicReason, privateNote, source.hash, at],
    );
    await audit(t, { at, actorUserId: actor.userId, subjectType: "claim", subjectId: c.id, revision: c.revision, action: ACTION[decision], fromStatus: c.status, toStatus: decision });
    await closeFinishedRequests(t, c.request_id, at);
  });
  await recomputeQuietly(ctx, c.user_id, c.division, c.season);
}

/** Record a decision on a school affiliation (identity/affiliation review). */
export async function decideMembership(ctx: Ctx, input: DecisionInput) {
  const actor = await requireAdmin(ctx, { mutation: true });
  if (typeof input.id !== "string") throw new ValidationError("Affiliation not found.");
  const m = await row<MembershipRow>(ctx.db, `SELECT * FROM school_memberships WHERE id = ?`, [input.id]);
  if (!m) throw new ValidationError("Affiliation not found.");
  separationOfDuty(actor, m.user_id);
  const publicReason = cleanReason(input.publicReason, "Reason");
  const privateNote = cleanReason(input.privateNote, "Private note");
  const decision = checkDecision(input.decision, publicReason);
  if (Number(input.revision) !== m.revision) throw new ConflictError("This affiliation changed during review. Reload and try again.");
  if (!canTransition(ACTION[decision], m.status)) throw new ConflictError(`Cannot ${ACTION[decision]} an affiliation that is ${m.status.toLowerCase()}.`);
  const at = ctx.now.toISOString();
  await tx(ctx.db, async (t) => {
    const n = await run(t, `UPDATE school_memberships SET status = ?, updated_at = ? WHERE id = ? AND revision = ? AND status = ?`, [
      decision,
      at,
      m.id,
      m.revision,
      m.status,
    ]);
    if (!n) throw new ConflictError("This affiliation changed during review. Reload and try again.");
    // Only a decision on a pending affiliation answers a submission; direct decisions (e.g. past seasons) have none.
    const req =
      m.status === "PENDING"
        ? await row<{ id: string }>(
            t,
            `SELECT id FROM verification_requests WHERE membership_id = ? AND include_membership = 1 ORDER BY created_at DESC LIMIT 1`,
            [m.id],
          )
        : null;
    await run(
      t,
      `INSERT INTO verification_decisions (id, subject_type, subject_id, subject_revision, request_id, reviewer_user_id, reviewer_oauth_account_id,
         decision, public_reason, private_note, created_at) VALUES (?, 'membership', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId("dec"), m.id, m.revision, req?.id ?? null, actor.userId, actor.oauthAccountId, decision, publicReason, privateNote, at],
    );
    await audit(t, { at, actorUserId: actor.userId, subjectType: "membership", subjectId: m.id, revision: m.revision, action: ACTION[decision], fromStatus: m.status, toStatus: decision });
    if (req) await closeFinishedRequests(t, req.id, at);
  });
}

/**
 * Review a whole submission in one form: each item gets its own decision
 * (or is skipped), recorded individually. Returns per-item outcomes.
 */
export async function decideSubmission(
  ctx: Ctx,
  input: { membership?: DecisionInput | null; claims: DecisionInput[] },
): Promise<{ id: string; ok: boolean; message?: string }[]> {
  await requireAdmin(ctx, { mutation: true });
  const results: { id: string; ok: boolean; message?: string }[] = [];
  const attempt = async (id: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ id, ok: true });
    } catch (e) {
      if (!isDomainError(e)) throw e;
      results.push({ id, ok: false, message: e.message });
    }
  };
  if (input.membership) await attempt(String(input.membership.id), () => decideMembership(ctx, input.membership!));
  for (const c of input.claims) await attempt(String(c.id), () => decideClaim(ctx, c));
  return results;
}
