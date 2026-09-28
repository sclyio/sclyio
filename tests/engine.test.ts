import { describe, expect, it } from "vitest";
import { rebuildRatings, snapshotDates, sundayOnOrAfter } from "../src/lib/rating/engine";
import { importAll, q, q1, sciolyff, straightPlacings, SyntheticSource, tempDb } from "./helpers";

/* SYNTHETIC fixtures: fictional schools only. */
const EV = ["Anatomy and Physiology", "Codebusters"];
const SCHOOLS = ["Alder Ridge High School", "Birch Hollow High School", "Cedar Point Academy", "Dogwood Middle College"];

function tourney(date: string, order: number[], name = `Invitational ${date}`) {
  return sciolyff({
    name,
    division: "C",
    year: 2026,
    date,
    events: EV.map((n) => ({ name: n })),
    teams: SCHOOLS.map((s, i) => ({ number: i + 1, school: s })),
    placings: straightPlacings(order, EV),
  });
}

const log = () => {};

describe("snapshot schedule", () => {
  it("dates snapshots on Sundays covering the season's results", () => {
    expect(sundayOnOrAfter("2026-01-10")).toBe("2026-01-11"); // Saturday -> Sunday
    expect(sundayOnOrAfter("2026-01-11")).toBe("2026-01-11");
    expect(snapshotDates(["2026-01-10", "2026-01-24"])).toEqual(["2026-01-11", "2026-01-18", "2026-01-25"]);
  });
});

describe("rating rebuild job (synthetic)", () => {
  async function setup() {
    const src = new SyntheticSource({}, { 2026: EV });
    src.write("2026-01-10_a_invitational_c", tourney("2026-01-10", [1, 2, 3, 4]));
    src.write("2026-01-24_b_invitational_c", tourney("2026-01-24", [2, 1, 3, 4]));
    src.write("2026-02-07_c_invitational_c", tourney("2026-02-07", [1, 3, 2, 4]));
    const db = tempDb();
    await importAll(db, src);
    return { src, db };
  }

  it("publishes a complete build atomically and ranks established entries", async () => {
    const { db } = await setup();
    const r = rebuildRatings({ db, log, params: { ...(await import("../src/lib/rating/config")).DEFAULT_PARAMS } });
    const published = q1<{ value: string }>(db, "SELECT value FROM kv WHERE key='published_build_id'").value;
    expect(Number(published)).toBe(r.buildId);
    const last = q1<{ id: number; established_count: number; official_events: number }>(
      db,
      "SELECT id, established_count, official_events FROM snapshots WHERE build_id=? AND view='team' ORDER BY as_of DESC LIMIT 1",
      r.buildId,
    );
    expect(last.official_events).toBe(2);
    expect(last.established_count).toBe(4); // 2/2 events, 3 tournaments each
    const ranks = q<{ national_rank: number }>(db, "SELECT national_rank FROM overall_ratings WHERE snapshot_id=? ORDER BY national_rank", last.id);
    expect(ranks.map((x) => x.national_rank)).toEqual([1, 2, 3, 4]);
    // Views are separate pools.
    const views = q<{ view: string }>(db, "SELECT DISTINCT view FROM snapshots WHERE build_id=? ORDER BY view", r.buildId);
    expect(views.map((v) => v.view)).toEqual(["school", "team"]);
  });

  it("pre-tournament field strength only uses refits strictly before the start date", async () => {
    const { db } = await setup();
    const r = rebuildRatings({ db, log });
    const fs = q<{ tournament_id: string; pre_snapshot_as_of: string | null }>(
      db,
      "SELECT tournament_id, pre_snapshot_as_of FROM field_strength WHERE build_id=? AND view='team'",
      r.buildId,
    );
    const start = new Map(q<{ id: string; start_date: string }>(db, "SELECT id, start_date FROM tournaments").map((t) => [t.id, t.start_date]));
    for (const f of fs) if (f.pre_snapshot_as_of) expect(f.pre_snapshot_as_of < start.get(f.tournament_id)!).toBe(true);
    expect(fs.find((f) => f.tournament_id.startsWith("2026-01-10"))!.pre_snapshot_as_of).toBeNull(); // nothing earlier
  });

  it("recomputes from the earliest affected date after a correction, copying earlier snapshots", async () => {
    const { db, src } = await setup();
    const first = rebuildRatings({ db, log });
    const before = q<{ as_of: string; z: number }>(
      db,
      `SELECT s.as_of, o.z FROM snapshots s JOIN overall_ratings o ON o.snapshot_id=s.id
       WHERE s.build_id=? AND s.view='team' AND o.entity_id LIKE '%dogwood%' ORDER BY s.as_of`,
      first.buildId,
    );
    // Correct the Feb 7 file: Dogwood actually won.
    src.write("2026-02-07_c_invitational_c", tourney("2026-02-07", [4, 1, 3, 2]));
    const res = await importAll(db, src);
    expect(res.changed).toBe(1);
    const pending = q1<{ value: string }>(db, "SELECT value FROM kv WHERE key='pending_rebuild_from'").value;
    expect(pending).toBe("2026-02-07");
    const second = rebuildRatings({ db, log, from: pending });
    expect(second.snapshotsCopied).toBeGreaterThan(0);
    const after = q<{ as_of: string; z: number }>(
      db,
      `SELECT s.as_of, o.z FROM snapshots s JOIN overall_ratings o ON o.snapshot_id=s.id
       WHERE s.build_id=? AND s.view='team' AND o.entity_id LIKE '%dogwood%' ORDER BY s.as_of`,
      second.buildId,
    );
    expect(after.length).toBe(before.length);
    for (let i = 0; i < after.length; i++) {
      if (after[i].as_of < "2026-02-07") expect(after[i].z).toBe(before[i].z); // unaffected history kept
    }
    expect(after[after.length - 1].z).toBeGreaterThan(before[before.length - 1].z);
    // Only one published build; the pending marker is cleared.
    expect(q<{ id: number }>(db, "SELECT id FROM rating_builds WHERE status='published'").length).toBe(1);
    expect(q(db, "SELECT value FROM kv WHERE key='pending_rebuild_from'").length).toBe(0);
  });
});
