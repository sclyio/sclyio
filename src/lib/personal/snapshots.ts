import type { Client } from "@libsql/client";
import type { DataSource } from "../accounts/actor";
import { newId, rows, run, sha256, tx } from "../accounts/db";
import { refreshClaimSources, type ClaimSourceRow } from "../accounts/sources";
import { DEFAULT_PARAMS, MODEL_VERSION } from "../rating/config";
import { loadEvidence, seasonSnapshot, type PersonalClaimInput } from "./evidence";
import { aggregatePersonal, PERSONAL_METHOD_VERSION, type ClaimEvidence, type PersonalSummary } from "./rating";

/**
 * Stored personal rating snapshots. Each (user, division, season) has one
 * current row, swapped atomically; earlier rows stay as history. A snapshot
 * records its inputs (claim ids, revisions, statuses, source fingerprints),
 * the dataset build, the rating snapshot it read, and the model/method
 * versions. When the current inputs no longer match, the score is
 * recomputed before display, or shown as pending — never silently stale.
 */

type ClaimRow = PersonalClaimInput & ClaimSourceRow & { revision: number };

/** Seasons counted for season S: S and the ones before it that carry a season weight. */
export const SEASONS_COUNTED = DEFAULT_PARAMS.seasonWeights.length;

/** Claims that feed the rating for (division, season): that season and the three before it. */
async function poolClaims(db: Client, userId: string, division: string, season: number): Promise<ClaimRow[]> {
  return rows<ClaimRow>(
    db,
    `SELECT id, status, revision, division, season, tournament_id, entry_id, tournament_event_id, event_def_id, source_hash, source_state
     FROM participation_claims WHERE user_id = ? AND division = ? AND season BETWEEN ? AND ? ORDER BY id`,
    [userId, division, season - SEASONS_COUNTED + 1, season],
  );
}

async function currentBuildId(data: DataSource): Promise<number | null> {
  const b = await data.get<{ value: string }>(`SELECT value FROM kv WHERE key = 'published_build_id'`);
  return b ? Number(b.value) : null;
}

/** Everything the stored score depends on. Any change means the score must be recomputed. */
export function inputsHash(claims: Pick<ClaimRow, "id" | "revision" | "status" | "source_state" | "source_hash">[], buildId: number | null) {
  const parts = claims.map((c) => [c.id, c.revision, c.status, c.source_state, c.source_hash]);
  return sha256(JSON.stringify({ m: MODEL_VERSION, p: PERSONAL_METHOD_VERSION, b: buildId, c: parts })).slice(0, 32);
}

export interface PersonalSnapshot extends PersonalSummary {
  id: string;
  /** Season Trend: the same method with this season's claims only. */
  trendZ: number | null;
  trendUsr: number | null;
  trendState: PersonalSummary["state"] | null;
  division: string;
  season: number;
  status: "ready" | "failed";
  modelVersion: string;
  methodVersion: string;
  datasetBuildId: number | null;
  ratingSnapshotId: number | null;
  ratingAsOf: string | null;
  computedAt: string;
  inputsHash: string;
  claims: ClaimEvidence[];
  error: string | null;
}

function fromRow(r: Record<string, unknown>): PersonalSnapshot {
  const detail = r.detail ? (JSON.parse(r.detail as string) as { events: PersonalSummary["events"]; claims: ClaimEvidence[] }) : { events: [], claims: [] };
  return {
    id: r.id as string,
    trendZ: (r.trend_z as number | null) ?? null,
    trendUsr: (r.trend_usr as number | null) ?? null,
    trendState: (r.trend_state as PersonalSummary["state"] | null) ?? null,
    division: r.division as string,
    season: r.season as number,
    status: r.status as "ready" | "failed",
    state: (r.state as PersonalSummary["state"]) ?? "no_eligible",
    modelVersion: r.model_version as string,
    methodVersion: r.method_version as string,
    datasetBuildId: (r.dataset_build_id as number | null) ?? null,
    ratingSnapshotId: (r.rating_snapshot_id as number | null) ?? null,
    ratingAsOf: (r.rating_as_of as string | null) ?? null,
    computedAt: r.computed_at as string,
    inputsHash: r.inputs_hash as string,
    summaryZ: (r.summary_z as number | null) ?? null,
    summaryUsr: (r.summary_usr as number | null) ?? null,
    ratedEvents: (r.rated_events as number) ?? 0,
    competitions: (r.competitions as number) ?? 0,
    contributingClaims: (r.contributing_claims as number) ?? 0,
    verifiedContributingClaims: (r.verified_contributing_claims as number) ?? 0,
    provisional: Boolean(r.provisional),
    events: detail.events,
    claims: detail.claims,
    error: (r.error as string | null) ?? null,
  };
}

/** Recompute and atomically replace the current snapshot for one pool. */
export async function recomputePersonal(db: Client, data: DataSource, userId: string, division: string, season: number, now: Date) {
  const claims = await poolClaims(db, userId, division, season);
  const at = now.toISOString();
  let buildId: number | null = null;
  let values: Record<string, unknown>;
  try {
    await refreshClaimSources(db, data, claims, now);
    buildId = await currentBuildId(data);
    const snapshot = await seasonSnapshot(data, division, season);
    const verified = new Set(claims.filter((c) => c.status === "VERIFIED" && c.source_state === "current").map((c) => c.id));
    const evidence = await loadEvidence(data, claims, snapshot, verified, { division, season });
    const s = aggregatePersonal(evidence);
    const trend = aggregatePersonal(evidence.filter((e) => e.season === season));
    values = {
      status: "ready",
      state: s.state,
      rating_snapshot_id: snapshot?.id ?? null,
      rating_as_of: snapshot?.asOf ?? null,
      summary_z: s.summaryZ,
      summary_usr: s.summaryUsr,
      trend_z: trend.summaryZ,
      trend_usr: trend.summaryUsr,
      trend_state: trend.state,
      rated_events: s.ratedEvents,
      competitions: s.competitions,
      contributing_claims: s.contributingClaims,
      verified_contributing_claims: s.verifiedContributingClaims,
      provisional: s.provisional ? 1 : 0,
      detail: JSON.stringify({ events: s.events, claims: evidence }),
      error: null,
    };
  } catch (e) {
    // Stored as the current row so the page shows "calculation pending", not an old score.
    values = { status: "failed", state: null, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
  }
  const hash = inputsHash(claims, buildId);
  const inputs = JSON.stringify(
    claims.map((c) => ({ id: c.id, revision: c.revision, status: c.status, source: c.source_state, sourceHash: c.source_hash })),
  );
  const id = newId("prs");
  await tx(db, async (t) => {
    await run(t, `UPDATE personal_rating_snapshots SET is_current = 0 WHERE user_id = ? AND division = ? AND season = ? AND is_current = 1`, [
      userId,
      division,
      season,
    ]);
    const cols = {
      id,
      user_id: userId,
      division,
      season,
      is_current: 1,
      model_version: MODEL_VERSION,
      method_version: PERSONAL_METHOD_VERSION,
      dataset_build_id: buildId,
      inputs_hash: hash,
      inputs,
      computed_at: at,
      ...values,
    } as Record<string, string | number | null>;
    const names = Object.keys(cols);
    await run(t, `INSERT INTO personal_rating_snapshots (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`, names.map((n) => cols[n]));
  });
}

/** Division/season pools the user has claims in (any status). */
export async function claimPools(db: Client, userId: string) {
  return rows<{ division: string; season: number }>(
    db,
    `SELECT DISTINCT division, season FROM participation_claims WHERE user_id = ? ORDER BY season DESC, division`,
    [userId],
  );
}

export type PersonalView = { pending: false; snapshot: PersonalSnapshot } | { pending: true; reason: string; snapshot: PersonalSnapshot | null };

/**
 * The current snapshot for display. If claims, statuses, or the published
 * dataset changed since it was computed, recompute first; if that fails,
 * report "calculation pending" instead of the outdated score.
 */
export async function personalRating(db: Client, data: DataSource, userId: string, division: string, season: number, now: Date): Promise<PersonalView> {
  const read = async () =>
    (
      await rows<Record<string, unknown>>(
        db,
        `SELECT * FROM personal_rating_snapshots WHERE user_id = ? AND division = ? AND season = ? AND is_current = 1`,
        [userId, division, season],
      )
    ).map(fromRow)[0] ?? null;
  const expected = async () => {
    let buildId: number | null = null;
    try {
      buildId = await currentBuildId(data);
    } catch {
      return null;
    }
    return inputsHash(await poolClaims(db, userId, division, season), buildId);
  };
  let snap = await read();
  let want = await expected();
  if (!snap || snap.status !== "ready" || snap.inputsHash !== want) {
    await recomputePersonal(db, data, userId, division, season, now);
    snap = await read();
    want = await expected();
  }
  if (!snap) return { pending: true, reason: "Rating calculation pending.", snapshot: null };
  if (snap.status !== "ready") return { pending: true, reason: "Rating calculation pending: the results data could not be read. Try again shortly.", snapshot: null };
  if (want !== null && snap.inputsHash !== want) return { pending: true, reason: "Rating calculation pending: your claims changed while it was computed.", snapshot: snap };
  return { pending: false, snapshot: snap };
}
