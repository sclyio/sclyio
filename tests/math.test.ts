import { describe, expect, it } from "vitest";
import fixture from "./fixtures/sentienttree-divb-aggregate-sample.json";
import { potentialSummary, referenceAggregate, schoolOverall, teamOverall } from "../src/lib/rating/aggregate";
import { effectiveN, fromUsr, inverseSoftplus, midranks, placementLogit, softplus, toUsr } from "../src/lib/rating/math";

describe("softplus / inverse softplus", () => {
  it("are stable at extreme inputs and invert each other", () => {
    for (const z of [-700, -50, -5, -1e-9, 0, 1e-9, 3, 40, 700]) {
      const y = softplus(z);
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThan(0);
      if (z > -700) expect(inverseSoftplus(y)).toBeCloseTo(z, 6);
    }
    expect(softplus(1000)).toBeCloseTo(1000, 9);
    expect(inverseSoftplus(1000)).toBeCloseTo(1000, 9);
    expect(softplus(0)).toBeCloseTo(Math.LN2, 12);
  });
  it("rejects non-positive inverse inputs", () => {
    expect(() => inverseSoftplus(0)).toThrow();
    expect(() => inverseSoftplus(-1)).toThrow();
  });
});

describe("placement logit", () => {
  it("is finite at the extremes, zero in the middle, antisymmetric", () => {
    expect(Number.isFinite(placementLogit(1, 2))).toBe(true);
    expect(placementLogit(1, 10)).toBeCloseTo(Math.log(10), 12);
    expect(placementLogit(10, 10)).toBeCloseTo(-Math.log(10), 12);
    expect(placementLogit(3, 5)).toBe(0);
    expect(placementLogit(2, 9)).toBeCloseTo(-placementLogit(8, 9), 12);
    expect(placementLogit(2.5, 4)).toBe(0); // midrank
  });
  it("needs at least two participants", () => {
    expect(() => placementLogit(1, 1)).toThrow();
  });
});

describe("midranks", () => {
  it("averages tied positions after exclusions", () => {
    const items = [
      { id: "a", place: 1 },
      { id: "b", place: 3 },
      { id: "c", place: 3 },
      { id: "d", place: 7 },
    ];
    const r = midranks(items, (i) => i.place);
    expect(items.map((i) => r.get(i))).toEqual([1, 2.5, 2.5, 4]);
  });
});

describe("display scale", () => {
  it("maps 0 to 10, is monotone, and inverts", () => {
    expect(toUsr(0)).toBe(10);
    expect(toUsr(1)).toBeGreaterThan(toUsr(0.999));
    expect(toUsr(-50)).toBeGreaterThan(0);
    expect(toUsr(50)).toBeLessThan(20);
    expect(fromUsr(toUsr(1.234))).toBeCloseTo(1.234, 10);
  });
});

describe("effective sample size", () => {
  it("equals n for equal weights and shrinks with unequal weights", () => {
    expect(effectiveN([1, 1, 1, 1])).toBeCloseTo(4);
    expect(effectiveN([10, 1, 1])).toBeLessThan(3);
  });
});

describe("aggregation", () => {
  it("team overall averages over all M slots with prior 0 for missing", () => {
    expect(teamOverall([2, null, 1, null], 4)).toBeCloseTo(0.75);
  });
  it("school overall treats missing slots as q = 0, not infinitely weak", () => {
    const withMissing = schoolOverall([2, null], 2);
    const reference = referenceAggregate([2, null], 2);
    expect(withMissing).toBeCloseTo(inverseSoftplus((softplus(2) + softplus(0)) / 2), 12);
    // The reference contributes nothing for a missing slot, which is lower.
    expect(reference).toBeLessThan(withMissing);
  });
  it("potential summary includes the lambda prior and favors strong results asymmetrically", () => {
    const single = potentialSummary([{ value: 3, w: 1 }], 2);
    expect(single).toBeGreaterThan(0);
    expect(single).toBeLessThan(3); // shrunk toward the prior
    const mixed = potentialSummary([{ value: 3, w: 1 }, { value: -3, w: 1 }], 0.0001);
    expect(mixed).toBeGreaterThan(0); // softplus mean: good result outweighs the bad
  });
});

describe("reference aggregate regression (SentientTree Div B FINAL, attributed fixture)", () => {
  it("reproduces displayed overall scores from the 23 event slots — aggregation only", () => {
    for (const row of fixture.rows) {
      const got = referenceAggregate(row.events as (number | null)[], 23);
      expect(Math.abs(got - row.overall)).toBeLessThan(1e-8);
    }
  });
});
