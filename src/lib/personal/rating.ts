import { DEFAULT_PARAMS } from "../rating/config";
import { toUsr } from "../rating/math";

/**
 * Unofficial personal USR (experimental proxy, not a validated model of
 * individual ability). Pure aggregation over the evidence loaded by
 * ./evidence.ts; it never writes to, or feeds back into, team or school
 * ratings.
 *
 * Like team ratings, the Unofficial USR for season S uses claims from S and
 * the three seasons before it (equivalent events, season weights 1, 1/2,
 * 1/4, 1/8 through w), and the Season Trend uses season S claims only.
 *
 * For each eligible claimed team-event result j:
 *   a_j = x_j + k_j     x = the engine's placement logit among eligible
 *                           participants; k = the fitted field offset of that
 *                           tournament event (Team Performance model)
 *   w_j                  the engine's normalized observation weight for that
 *                           tournament event (season, recency, level, format,
 *                           field size, competitiveness)
 * Per event e:   s_e = Σ w_j a_j / (Σ w_j + 2)          (latent prior 0, weight 2)
 * Summary:       mean of s_e over the nationally comparable rated events
 * Display:       USR = 1 + 15.5 / (1 + exp(-(z - 0.85) / 0.6))  (the site's v2 display mapping, toUsr)
 */

/** personal-v1: one season. personal-v2: last 4 seasons (engine weights) + Season Trend. */
export const PERSONAL_METHOD_VERSION = "personal-v2";
export const PERSONAL_PRIOR_WEIGHT = 2;

/** Statuses whose claims count toward the unofficial rating. */
export const COUNTED_STATUSES = new Set(["SELF_REPORTED", "PENDING", "VERIFIED"]);

/**
 * Provisional heuristic: fewer than PROVISIONAL_MIN_CLAIMS comparable
 * contributing claims, or fewer than PROVISIONAL_MIN_COMPETITIONS distinct
 * competitions among them.
 */
export const PROVISIONAL_MIN_CLAIMS = 3;
export const PROVISIONAL_MIN_COMPETITIONS = 2;

/** Why a claim adds nothing to the rating. */
export type ClaimOutcome =
  | "counted" // contributes a model-adjusted performance
  | "not_counted" // rejected / revoked / withdrawn
  | "no_eligible_result" // no rated official result for this team-event
  | "no_model_estimate" // result exists but the model has no fitted field offset for it
  | "pending"; // no rating snapshot for this season yet

export interface ClaimEvidence {
  claimId: string;
  status: string;
  verified: boolean;
  tournamentId: string;
  /** Season of the claimed tournament. */
  season: number;
  /** The rated season's official event this claim counts toward. */
  eventDefId: string;
  eventName: string;
  outcome: ClaimOutcome;
  reason: string | null;
  x?: number;
  k?: number;
  w?: number;
  a?: number;
  modelRank?: number;
  n?: number;
  /** Team's event graph component in the snapshot fit; 0 = nationally comparable. */
  comparable?: boolean;
}

export interface PersonalEvent {
  eventDefId: string;
  name: string;
  skill: number;
  usr: number;
  comparable: boolean;
  claims: number;
  competitions: number;
  weight: number;
}

export type PersonalState = "rated" | "insufficient_comparable" | "no_eligible";

export interface PersonalSummary {
  state: PersonalState;
  summaryZ: number | null;
  summaryUsr: number | null;
  ratedEvents: number;
  competitions: number;
  contributingClaims: number;
  verifiedContributingClaims: number;
  provisional: boolean;
  events: PersonalEvent[];
}

export function personalEventSkill(items: { a: number; w: number }[], prior = PERSONAL_PRIOR_WEIGHT): number {
  let num = 0;
  let den = prior;
  for (const it of items) {
    if (!(it.w > 0) || !Number.isFinite(it.a)) throw new RangeError("personal evidence needs positive weights and finite values");
    num += it.w * it.a;
    den += it.w;
  }
  return num / den;
}

export function aggregatePersonal(evidence: ClaimEvidence[]): PersonalSummary {
  const used = evidence.filter((e) => e.outcome === "counted" && e.a !== undefined && e.w !== undefined);
  const byEvent = new Map<string, ClaimEvidence[]>();
  for (const e of used) {
    let arr = byEvent.get(e.eventDefId);
    if (!arr) byEvent.set(e.eventDefId, (arr = []));
    arr.push(e);
  }
  const events: PersonalEvent[] = [];
  const nationalClaims: ClaimEvidence[] = [];
  const contributing: ClaimEvidence[] = [];
  for (const [def, arr] of byEvent) {
    // National estimate from comparable results only; a local-only estimate
    // (disconnected event graph) is shown but never averaged into the summary.
    const national = arr.filter((e) => e.comparable);
    const pick = national.length ? national : arr;
    events.push({
      eventDefId: def,
      name: arr[0].eventName,
      skill: personalEventSkill(pick.map((e) => ({ a: e.a!, w: e.w! }))),
      usr: 0,
      comparable: national.length > 0,
      claims: pick.length,
      competitions: new Set(pick.map((e) => e.tournamentId)).size,
      weight: pick.reduce((s, e) => s + e.w!, 0),
    });
    contributing.push(...pick);
    if (national.length) nationalClaims.push(...national);
  }
  for (const e of events) e.usr = toUsr(e.skill, DEFAULT_PARAMS);
  events.sort((p, q) => Number(q.comparable) - Number(p.comparable) || q.skill - p.skill || p.name.localeCompare(q.name));

  const rated = events.filter((e) => e.comparable);
  const competitions = new Set(nationalClaims.map((e) => e.tournamentId)).size;
  const base = {
    contributingClaims: contributing.length,
    verifiedContributingClaims: contributing.filter((e) => e.verified).length,
    events,
  };
  if (!rated.length) {
    return {
      ...base,
      state: events.length ? "insufficient_comparable" : "no_eligible",
      summaryZ: null,
      summaryUsr: null,
      ratedEvents: 0,
      competitions,
      provisional: true,
    };
  }
  const z = rated.reduce((s, e) => s + e.skill, 0) / rated.length;
  return {
    ...base,
    state: "rated",
    summaryZ: z,
    summaryUsr: toUsr(z, DEFAULT_PARAMS),
    ratedEvents: rated.length,
    competitions,
    provisional: nationalClaims.length < PROVISIONAL_MIN_CLAIMS || competitions < PROVISIONAL_MIN_COMPETITIONS,
  };
}
