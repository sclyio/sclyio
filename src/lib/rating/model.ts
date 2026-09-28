import { potentialSummary, schoolOverall, teamOverall } from "./aggregate";
import type { ModelParams, RatingView } from "./config";
import { fitCG, type Observation } from "./fit";
import { components } from "./graph";
import { daysBetween, effectiveN, toUsr } from "./math";

/**
 * One as-of snapshot of the v2 model for a single (division, view, season)
 * pool. Pure computation over in-memory observations: no database access,
 * so it is directly testable and reusable by the backtester.
 */

export interface PoolObservation {
  entityId: string;
  fieldId: string; // tournament event id
  tournamentId: string;
  eventDefId: string;
  defSeason: number;
  endDate: string;
  nSchools: number;
  x: number;
  format: string;
}

export interface EventFitState {
  eventDefId: string;
  /** entity -> own observations with normalized weights. */
  own: Map<string, { fieldId: string; x: number; w: number; endDate: string; tournamentId: string }[]>;
  k: Map<string, number>;
  s: Map<string, number>;
  q: Map<string, number>;
  component: Map<string, number>;
}

export interface EventRatingOut {
  entityId: string;
  eventDefId: string;
  value: number;
  skill: number;
  appearances: number;
  uniqueOpponents: number;
  nEff: number;
  lastDate: string;
  shrinkage: number;
  component: number;
  weak: boolean;
  evidence: "strong" | "moderate" | "limited" | "local-only";
}

export interface EventDiagnostics {
  eventDefId: string;
  observations: number;
  entities: number;
  fields: number;
  iterations: number;
  converged: boolean;
  fixedPointResidual: number;
  gradientNorm: number;
  components: number;
  referenceSize: number;
  localOnlyEntities: number;
}

export interface OverallOut {
  entityId: string;
  z: number;
  usr: number;
  comparableEvents: number;
  observedEvents: number;
  tournaments: number;
  observations: number;
  lastCompetition: string | null;
  hasCurrentSeason: boolean;
}

export interface SnapshotResult {
  asOf: string;
  events: Map<string, EventFitState>;
  eventRatings: EventRatingOut[];
  diagnostics: EventDiagnostics[];
  fieldFits: { fieldId: string; k: number; weight: number; n: number }[];
  overall: Map<string, OverallOut>;
}

export function formatWeight(format: string, p: ModelParams): number {
  if (format === "online") return p.onlineWeight;
  if (format === "unknown") return p.unknownFormatWeight;
  return 1;
}

export function observationWeight(o: { endDate: string; nSchools: number; format: string }, asOf: string, p: ModelParams) {
  const age = daysBetween(o.endDate, asOf);
  return Math.exp(-age / p.decayDays) * Math.pow(o.nSchools, p.fieldSizeExponent) * formatWeight(o.format, p);
}

/** Observations usable at asOf: completed on or before asOf, inside the rolling window. */
export function inWindow(endDate: string, asOf: string, p: ModelParams): boolean {
  if (endDate > asOf) return false;
  return daysBetween(endDate, asOf) < p.windowDays;
}

export function evidenceLabel(component: number, appearances: number, nEff: number): EventRatingOut["evidence"] {
  if (component !== 0) return "local-only";
  if (appearances >= 3 && nEff >= 2.5) return "strong";
  if (appearances >= 2) return "moderate";
  return "limited";
}

export function fitEventPool(
  eventDefId: string,
  obsAll: PoolObservation[],
  asOf: string,
  p: ModelParams,
  view: RatingView,
): { state: EventFitState; ratings: EventRatingOut[]; diag: EventDiagnostics; fieldFits: SnapshotResult["fieldFits"] } {
  const obs = obsAll.filter((o) => inWindow(o.endDate, asOf, p));
  const entityIdx = new Map<string, number>();
  const fieldIdx = new Map<string, number>();
  const entityIds: string[] = [];
  const fieldIds: string[] = [];
  const packed: Observation[] = [];
  for (const o of obs) {
    let e = entityIdx.get(o.entityId);
    if (e === undefined) {
      e = entityIds.length;
      entityIdx.set(o.entityId, e);
      entityIds.push(o.entityId);
    }
    let f = fieldIdx.get(o.fieldId);
    if (f === undefined) {
      f = fieldIds.length;
      fieldIdx.set(o.fieldId, f);
      fieldIds.push(o.fieldId);
    }
    packed.push({ entity: e, field: f, x: o.x, w: observationWeight(o, asOf, p) });
  }
  // Normalize weights to mean 1 within this fitted event pool.
  if (packed.length) {
    let sum = 0;
    for (const o of packed) sum += o.w;
    const f = packed.length / sum;
    for (const o of packed) o.w *= f;
  }
  const fit = fitCG({
    nEntities: entityIds.length,
    nFields: fieldIds.length,
    obs: packed,
    lambdaS: p.lambdaS,
    lambdaK: p.lambdaK,
    tolerance: p.tolerance,
    maxIterations: p.maxIterations,
  });
  const comp = components(entityIds.length, fieldIds.length, packed);

  const own: EventFitState["own"] = new Map();
  const perEntity: { w: number[]; last: string; fields: Set<number>; adjusted: { value: number; w: number }[] }[] =
    entityIds.map(() => ({ w: [], last: "", fields: new Set(), adjusted: [] }));
  const members: number[][] = fieldIds.map(() => []);
  const fieldWeight = new Float64Array(fieldIds.length);
  const fieldN = new Int32Array(fieldIds.length);
  packed.forEach((po, j) => {
    const o = obs[j];
    const pe = perEntity[po.entity];
    pe.w.push(po.w);
    if (o.endDate > pe.last) pe.last = o.endDate;
    pe.fields.add(po.field);
    pe.adjusted.push({ value: po.x + fit.k[po.field], w: po.w });
    members[po.field].push(po.entity);
    fieldWeight[po.field] += po.w;
    fieldN[po.field]++;
    let arr = own.get(o.entityId);
    if (!arr) own.set(o.entityId, (arr = []));
    arr.push({ fieldId: o.fieldId, x: o.x, w: po.w, endDate: o.endDate, tournamentId: o.tournamentId });
  });

  const state: EventFitState = { eventDefId, own, k: new Map(), s: new Map(), q: new Map(), component: new Map() };
  fieldIds.forEach((id, t) => state.k.set(id, fit.k[t]));
  const ratings: EventRatingOut[] = [];
  entityIds.forEach((id, i) => {
    const pe = perEntity[i];
    const W = pe.w.reduce((a, b) => a + b, 0);
    const s = fit.s[i];
    const q = view === "school" ? potentialSummary(pe.adjusted, p.lambdaS) : s;
    const opp = new Set<number>();
    for (const f of pe.fields) for (const m of members[f]) if (m !== i) opp.add(m);
    const component = comp.entityComponent[i];
    state.s.set(id, s);
    state.q.set(id, q);
    state.component.set(id, component);
    const nEff = effectiveN(pe.w);
    ratings.push({
      entityId: id,
      eventDefId,
      value: q,
      skill: s,
      appearances: pe.w.length,
      uniqueOpponents: opp.size,
      nEff,
      lastDate: pe.last,
      shrinkage: p.lambdaS / (W + p.lambdaS),
      component,
      weak: comp.weaklyConnected.has(i),
      evidence: evidenceLabel(component, pe.w.length, nEff),
    });
  });
  const diag: EventDiagnostics = {
    eventDefId,
    observations: packed.length,
    entities: entityIds.length,
    fields: fieldIds.length,
    iterations: fit.iterations,
    converged: fit.converged,
    fixedPointResidual: fit.fixedPointResidual,
    gradientNorm: fit.gradientNorm,
    components: comp.sizes.length,
    referenceSize: comp.sizes[0] ?? 0,
    localOnlyEntities: comp.sizes.slice(1).reduce((a, b) => a + b, 0),
  };
  const fieldFits = fieldIds.map((id, t) => ({ fieldId: id, k: fit.k[t], weight: fieldWeight[t], n: fieldN[t] }));
  return { state, ratings, diag, fieldFits };
}

/**
 * Fit every official event of the target season and aggregate overall
 * ratings for entities with at least one current-season observation.
 */
export function computeSnapshot(args: {
  asOf: string;
  season: number;
  view: RatingView;
  officialEventDefs: string[]; // target season, length M
  poolDefs: Map<string, string[]>; // target def -> defs contributing (equivalents)
  observationsByDef: Map<string, PoolObservation[]>;
  params: ModelParams;
}): SnapshotResult {
  const { asOf, season, view, officialEventDefs, params: p } = args;
  const M = officialEventDefs.length;
  const events = new Map<string, EventFitState>();
  const eventRatings: EventRatingOut[] = [];
  const diagnostics: EventDiagnostics[] = [];
  const fieldFits: SnapshotResult["fieldFits"] = [];
  const entityInfo = new Map<
    string,
    { tournaments: Set<string>; obs: number; last: string | null; current: boolean; observed: Set<string> }
  >();

  for (const def of officialEventDefs) {
    const contributing = args.poolDefs.get(def) ?? [def];
    const obs: PoolObservation[] = [];
    for (const d of contributing) {
      for (const o of args.observationsByDef.get(d) ?? []) {
        // Team Performance uses only the target season's team entries.
        if (view === "team" && o.defSeason !== season) continue;
        obs.push(o);
      }
    }
    const r = fitEventPool(def, obs, asOf, p, view);
    events.set(def, r.state);
    eventRatings.push(...r.ratings);
    diagnostics.push(r.diag);
    fieldFits.push(...r.fieldFits);
    for (const o of obs) {
      if (!inWindow(o.endDate, asOf, p)) continue;
      let info = entityInfo.get(o.entityId);
      if (!info) {
        entityInfo.set(o.entityId, (info = { tournaments: new Set(), obs: 0, last: null, current: false, observed: new Set() }));
      }
      info.tournaments.add(o.tournamentId);
      info.obs++;
      info.observed.add(def);
      if (!info.last || o.endDate > info.last) info.last = o.endDate;
      if (o.defSeason === season) info.current = true;
    }
  }

  const overall = new Map<string, OverallOut>();
  for (const [entityId, info] of entityInfo) {
    const vals: (number | null)[] = [];
    let comparable = 0;
    for (const def of officialEventDefs) {
      const st = events.get(def)!;
      if (st.component.get(entityId) === 0) {
        comparable++;
        vals.push(view === "school" ? st.q.get(entityId)! : st.s.get(entityId)!);
      } else {
        vals.push(null); // missing or not nationally comparable -> latent prior
      }
    }
    const z = view === "school" ? schoolOverall(vals, M) : teamOverall(vals, M);
    overall.set(entityId, {
      entityId,
      z,
      usr: toUsr(z, p.scaleMax, p.scaleSpread),
      comparableEvents: comparable,
      observedEvents: info.observed.size,
      tournaments: info.tournaments.size,
      observations: info.obs,
      lastCompetition: info.last,
      hasCurrentSeason: info.current,
    });
  }
  return { asOf, events, eventRatings, diagnostics, fieldFits, overall };
}

export type RatingStatus = "established" | "provisional" | "inactive";

export function ratingStatus(o: OverallOut, M: number, asOf: string, p: ModelParams): RatingStatus {
  if (o.lastCompetition && daysBetween(o.lastCompetition, asOf) > p.inactiveAfterDays) return "inactive";
  const needed = Math.ceil(M * p.minComparableEventFraction);
  if (o.comparableEvents >= needed && o.tournaments >= p.minTournaments) return "established";
  return "provisional";
}

/* ------------------------------------------------------------------ */
/* Change attribution                                                 */
/* ------------------------------------------------------------------ */

type OwnObs = { fieldId: string; x: number; w: number };

function eventValue(own: OwnObs[], k: Map<string, number>, view: RatingView, p: ModelParams): number {
  if (view === "school") {
    return potentialSummary(
      own.map((o) => ({ value: o.x + (k.get(o.fieldId) ?? 0), w: o.w })),
      p.lambdaS,
    );
  }
  let num = 0;
  let den = p.lambdaS;
  for (const o of own) {
    num += o.w * (o.x + (k.get(o.fieldId) ?? 0));
    den += o.w;
  }
  return num / den;
}

export interface Attribution {
  prevZ: number | null;
  dAdded: number;
  dRecency: number;
  dField: number;
  dOther: number;
  events: { eventDefId: string; added: number; recency: number; field: number; other: number }[];
}

/**
 * Exact telescoping decomposition of an entity's overall change between two
 * consecutive snapshots:
 *   window/coverage (other) → field recalibration (k) → recency (weights)
 *   → added results. Each stage recomputes the event value given the fitted
 * k, which reproduces the fitted skill at convergence.
 */
export function attributeChange(
  entityId: string,
  prev: SnapshotResult | null,
  cur: SnapshotResult,
  officialEventDefs: string[],
  view: RatingView,
  p: ModelParams,
): Attribution {
  const M = officialEventDefs.length;
  const agg = (vals: (number | null)[]) => (view === "school" ? schoolOverall(vals, M) : teamOverall(vals, M));
  const stages: (number | null)[][] = [[], [], [], [], []];
  const perEvent: Attribution["events"] = [];
  for (const def of officialEventDefs) {
    const ps = prev?.events.get(def);
    const cs = cur.events.get(def)!;
    const pOwn = ps?.own.get(entityId) ?? [];
    const cOwn = cs.own.get(entityId) ?? [];
    const pComparable = ps?.component.get(entityId) === 0;
    const cComparable = cs.component.get(entityId) === 0;
    const curFields = new Set(cOwn.map((o) => o.fieldId));
    const prevFields = new Set(pOwn.map((o) => o.fieldId));
    const kept = pOwn.filter((o) => curFields.has(o.fieldId));
    const keptNewW = cOwn.filter((o) => prevFields.has(o.fieldId));
    const hasAdded = cOwn.some((o) => !prevFields.has(o.fieldId));

    const v0 = pComparable && ps ? eventValue(pOwn, ps.k, view, p) : null;
    const v4 = cComparable ? eventValue(cOwn, cs.k, view, p) : null;
    let v1: number | null = null;
    let v2: number | null = null;
    let v3: number | null = null;
    if (pComparable && cComparable && ps) {
      v1 = eventValue(kept, ps.k, view, p); // results that left the window
      v2 = eventValue(kept, cs.k, view, p); // field recalibration
      v3 = eventValue(keptNewW, cs.k, view, p); // recency re-weighting
    } else if (!pComparable && cComparable && !hasAdded) {
      // Became nationally comparable through other teams' new results.
      v1 = v2 = v3 = v4;
    }
    // Lost comparability -> "other"; newly comparable with own results -> "added".
    stages[0].push(v0);
    stages[1].push(v1);
    stages[2].push(v2);
    stages[3].push(v3);
    stages[4].push(v4);
    const zz = (v: number | null) => v ?? 0;
    perEvent.push({
      eventDefId: def,
      other: (zz(v1) - zz(v0)) / M,
      field: (zz(v2) - zz(v1)) / M,
      recency: (zz(v3) - zz(v2)) / M,
      added: (zz(v4) - zz(v3)) / M,
    });
  }
  const z = stages.map(agg);
  return {
    prevZ: prev && prev.overall.has(entityId) ? prev.overall.get(entityId)!.z : null,
    dOther: z[1] - z[0],
    dField: z[2] - z[1],
    dRecency: z[3] - z[2],
    dAdded: z[4] - z[3],
    events: perEvent,
  };
}
