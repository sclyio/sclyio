import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../src/lib/rating/config";
import { fitAlternating, fitCG, fitDense, normalizeWeights, type Observation } from "../src/lib/rating/fit";
import { components } from "../src/lib/rating/graph";
import { placementLogit } from "../src/lib/rating/math";
import {
  attributeChange,
  computeSnapshot,
  fitEventPool,
  inWindow,
  observationWeight,
  ratingStatus,
  type PoolObservation,
} from "../src/lib/rating/model";

/** Synthetic event pool: fictional entities, invented finishes. */
function syntheticObs(): Observation[] {
  // 5 entities, 3 fields; field 2 is a stronger field (entities 0,1 finish lower there).
  const rows: [number, number, number, number][] = [
    // entity, field, rank, n
    [0, 0, 1, 4], [1, 0, 2, 4], [2, 0, 3, 4], [3, 0, 4, 4],
    [0, 1, 1, 3], [2, 1, 2, 3], [4, 1, 3, 3],
    [0, 2, 2, 3], [1, 2, 3, 3], [4, 2, 1, 3],
  ];
  return rows.map(([entity, field, r, n], i) => ({ entity, field, x: placementLogit(r, n), w: 0.5 + (i % 3) * 0.25 }));
}

describe("regularized fit", () => {
  const base = { nEntities: 5, nFields: 3, lambdaS: 2, lambdaK: 1, tolerance: 1e-10, maxIterations: 10000 };
  it("CG, alternating updates, and an independent dense solve agree (unique minimizer)", () => {
    const obs = syntheticObs();
    const dense = fitDense({ ...base, obs });
    const cg = fitCG({ ...base, obs });
    const alt = fitAlternating({ ...base, obs });
    expect(cg.converged).toBe(true);
    expect(alt.converged).toBe(true);
    for (let i = 0; i < 5; i++) {
      expect(cg.s[i]).toBeCloseTo(dense.s[i], 8);
      expect(alt.s[i]).toBeCloseTo(dense.s[i], 7);
    }
    for (let t = 0; t < 3; t++) expect(cg.k[t]).toBeCloseTo(dense.k[t], 8);
    expect(cg.gradientNorm).toBeLessThan(1e-8);
  });

  it("is deterministic", () => {
    const a = fitCG({ ...base, obs: syntheticObs() });
    const b = fitCG({ ...base, obs: syntheticObs() });
    expect(Array.from(a.s)).toEqual(Array.from(b.s));
  });

  it("reports non-convergence instead of silently succeeding", () => {
    const r = fitAlternating({ ...base, obs: syntheticObs(), maxIterations: 2, tolerance: 1e-14 });
    expect(r.converged).toBe(false);
  });

  it("shrinks sparse profiles toward the prior", () => {
    // One first-place finish in a 2-team field vs. five first-place finishes.
    const obs: Observation[] = [
      { entity: 0, field: 0, x: placementLogit(1, 2), w: 1 },
      { entity: 1, field: 0, x: placementLogit(2, 2), w: 1 },
    ];
    for (let f = 1; f <= 5; f++) {
      obs.push({ entity: 2, field: f, x: placementLogit(1, 2), w: 1 });
      obs.push({ entity: 3, field: f, x: placementLogit(2, 2), w: 1 });
    }
    const r = fitCG({ nEntities: 4, nFields: 6, obs, lambdaS: 2, lambdaK: 1 });
    expect(Math.abs(r.s[0])).toBeLessThan(Math.abs(r.s[2]));
    expect(r.s[0]).toBeGreaterThan(0);
  });

  it("gives a positive field offset to a stronger field", () => {
    // Entity 0 wins field 0 (weak) and finishes last in field 1 against 1,2
    // which also beat the rest of field 0.
    const obs: Observation[] = [];
    const add = (e: number, f: number, r: number, n: number) => obs.push({ entity: e, field: f, x: placementLogit(r, n), w: 1 });
    [0, 3, 4, 5].forEach((e, i) => add(e, 0, i + 1, 4));
    [1, 2, 0].forEach((e, i) => add(e, 1, i + 1, 3));
    [1, 2, 3].forEach((e, i) => add(e, 2, i + 1, 3));
    const r = fitDense({ nEntities: 6, nFields: 3, obs, lambdaS: 2, lambdaK: 1 });
    expect(r.k[1]).toBeGreaterThan(r.k[0]);
  });

  it("normalizes weights to mean 1", () => {
    const obs = syntheticObs();
    normalizeWeights(obs);
    expect(obs.reduce((a, o) => a + o.w, 0) / obs.length).toBeCloseTo(1, 12);
  });
});

describe("graph components", () => {
  it("separates disconnected regions and labels the largest as reference", () => {
    const edges = [
      { entity: 0, field: 0 }, { entity: 1, field: 0 }, { entity: 2, field: 0 },
      { entity: 2, field: 1 }, { entity: 3, field: 1 },
      { entity: 4, field: 2 }, { entity: 5, field: 2 },
    ];
    const c = components(6, 3, edges);
    expect(c.sizes).toEqual([4, 2]);
    expect(Array.from(c.entityComponent)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(c.fieldComponent[2]).toBe(1);
  });
});

describe("weights, recency, and leakage", () => {
  const p = DEFAULT_PARAMS;
  it("weights are positive and decrease with age (recency direction)", () => {
    const recent = observationWeight({ endDate: "2026-03-01", nSchools: 20, format: "in-person" }, "2026-03-08", p);
    const older = observationWeight({ endDate: "2025-11-01", nSchools: 20, format: "in-person" }, "2026-03-08", p);
    expect(recent).toBeGreaterThan(0);
    expect(older).toBeGreaterThan(0);
    expect(recent).toBeGreaterThan(older);
  });
  it("larger fields weigh more (quarter power) and online is discounted", () => {
    const small = observationWeight({ endDate: "2026-03-01", nSchools: 16, format: "in-person" }, "2026-03-01", p);
    const big = observationWeight({ endDate: "2026-03-01", nSchools: 81, format: "in-person" }, "2026-03-01", p);
    expect(big / small).toBeCloseTo(1.5, 10);
    const online = observationWeight({ endDate: "2026-03-01", nSchools: 16, format: "online" }, "2026-03-01", p);
    expect(online / small).toBeCloseTo(0.5, 12);
    const unknown = observationWeight({ endDate: "2026-03-01", nSchools: 16, format: "unknown" }, "2026-03-01", p);
    expect(unknown).toBeCloseTo(small, 12);
  });
  it("never uses results completed after the as-of date, and applies the window", () => {
    expect(inWindow("2026-03-02", "2026-03-01", p)).toBe(false);
    expect(inWindow("2026-03-01", "2026-03-01", p)).toBe(true);
    expect(inWindow("2025-01-01", "2026-03-01", p)).toBe(false); // > 400 days
  });
  it("a snapshot ignores future observations entirely", () => {
    const obs: PoolObservation[] = [
      mk("a", "t1:e", "2026-01-10", 1, 2),
      mk("b", "t1:e", "2026-01-10", 2, 2),
      mk("b", "t2:e", "2026-02-10", 1, 2), // future relative to as-of
      mk("a", "t2:e", "2026-02-10", 2, 2),
    ];
    const before = fitEventPool("C-2026-e", obs.slice(0, 2), "2026-01-11", p, "team");
    const withFuture = fitEventPool("C-2026-e", obs, "2026-01-11", p, "team");
    expect(withFuture.state.s.get("a")).toBe(before.state.s.get("a"));
    expect(withFuture.diag.observations).toBe(2);
  });
});

function mk(entityId: string, fieldId: string, endDate: string, rank: number, n: number, defSeason = 2026, eventDefId = "C-2026-e"): PoolObservation {
  return {
    entityId,
    fieldId,
    tournamentId: fieldId.split(":")[0],
    eventDefId,
    defSeason,
    endDate,
    nSchools: n,
    x: placementLogit(rank, n),
    format: "in-person",
  };
}

describe("snapshot aggregation and eligibility", () => {
  const p = { ...DEFAULT_PARAMS, minTournaments: 1 };
  const defs = ["C-2026-e1", "C-2026-e2"];
  const byDef = new Map<string, PoolObservation[]>([
    ["C-2026-e1", [mk("a", "t1:e1", "2026-01-10", 1, 3, 2026, "C-2026-e1"), mk("b", "t1:e1", "2026-01-10", 2, 3, 2026, "C-2026-e1"), mk("c", "t1:e1", "2026-01-10", 3, 3, 2026, "C-2026-e1")]],
    ["C-2026-e2", [mk("a", "t1:e2", "2026-01-10", 2, 2, 2026, "C-2026-e2"), mk("b", "t1:e2", "2026-01-10", 1, 2, 2026, "C-2026-e2")]],
    // Prior-season equivalent observations for school view only.
    ["C-2025-e1", [mk("a", "t0:e1", "2025-04-01", 3, 3, 2025, "C-2025-e1"), mk("d", "t0:e1", "2025-04-01", 1, 3, 2025, "C-2025-e1"), mk("c", "t0:e1", "2025-04-01", 2, 3, 2025, "C-2025-e1")]],
  ]);
  const poolDefs = new Map([
    ["C-2026-e1", ["C-2026-e1", "C-2025-e1"]],
    ["C-2026-e2", ["C-2026-e2"]],
  ]);

  it("missing events use the latent prior and lower coverage; status reflects coverage", () => {
    const snap = computeSnapshot({ asOf: "2026-01-11", season: 2026, view: "team", officialEventDefs: defs, poolDefs, observationsByDef: byDef, params: p });
    const c = snap.overall.get("c")!;
    expect(c.comparableEvents).toBe(1);
    const e1 = snap.events.get("C-2026-e1")!.s.get("c")!;
    expect(c.z).toBeCloseTo(e1 / 2, 12); // e2 slot contributes 0
    expect(ratingStatus(c, 2, "2026-01-11", p)).toBe("provisional");
    expect(ratingStatus(snap.overall.get("a")!, 2, "2026-01-11", p)).toBe("established");
  });

  it("team view never uses prior-season results; school view uses only mapped equivalents", () => {
    const team = computeSnapshot({ asOf: "2026-01-11", season: 2026, view: "team", officialEventDefs: defs, poolDefs, observationsByDef: byDef, params: p });
    expect(team.overall.has("d")).toBe(false);
    const school = computeSnapshot({ asOf: "2026-01-11", season: 2026, view: "school", officialEventDefs: defs, poolDefs, observationsByDef: byDef, params: p });
    expect(school.events.get("C-2026-e1")!.s.has("d")).toBe(true);
    // d has no current-season observation: excluded from current rankings.
    expect(school.overall.get("d")!.hasCurrentSeason).toBe(false);
    expect(school.events.get("C-2026-e2")!.s.has("d")).toBe(false);
  });

  it("change attribution telescopes exactly to the overall change", () => {
    const later = new Map(byDef);
    later.set("C-2026-e1", [...byDef.get("C-2026-e1")!, mk("c", "t3:e1", "2026-02-01", 1, 2, 2026, "C-2026-e1"), mk("a", "t3:e1", "2026-02-01", 2, 2, 2026, "C-2026-e1")]);
    const s1 = computeSnapshot({ asOf: "2026-01-11", season: 2026, view: "school", officialEventDefs: defs, poolDefs, observationsByDef: byDef, params: p });
    const s2 = computeSnapshot({ asOf: "2026-02-01", season: 2026, view: "school", officialEventDefs: defs, poolDefs, observationsByDef: later, params: p });
    for (const id of ["a", "b", "c"]) {
      const att = attributeChange(id, s1, s2, defs, "school", p);
      const total = att.dAdded + att.dRecency + att.dField + att.dOther;
      expect(total).toBeCloseTo(s2.overall.get(id)!.z - s1.overall.get(id)!.z, 9);
    }
    // b had no new result but its rating still moves (field recalibration / recency).
    const b = attributeChange("b", s1, s2, defs, "school", p);
    expect(b.dAdded).toBeCloseTo(0, 12);
    expect(Math.abs(b.dField) + Math.abs(b.dRecency)).toBeGreaterThan(1e-6);
  });
});
