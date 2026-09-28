import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyMappings } from "../src/lib/identity/mappings";
import { schoolMatchKey } from "../src/lib/identity/normalize";
import { resolveIdentities, type RawEntry } from "../src/lib/identity/resolve";
import { parseSciolyff } from "../src/lib/source/duosmium-parse";
import { importAll, q, q1, sciolyff, straightPlacings, SyntheticSource, tempDb } from "./helpers";

const EV = ["Anatomy and Physiology", "Codebusters", "Circuit Lab"];
const OFFICIAL = { 2026: EV, 2025: ["Anatomy and Physiology", "Codebusters", "Optics"] };

function baseTournament(overrides: Partial<Parameters<typeof sciolyff>[0]> = {}) {
  return sciolyff({
    name: "Alder Ridge Invitational",
    division: "C",
    year: 2026,
    date: "2026-01-10",
    events: EV.map((name) => ({ name })),
    teams: [
      { number: 1, school: "Alder Ridge High School", suffix: "Gold" },
      { number: 2, school: "Alder Ridge High School", suffix: "Blue" },
      { number: 3, school: "Birch Hollow High School" },
      { number: 4, school: "Cedar Point Academy" },
    ],
    placings: straightPlacings([1, 3, 2, 4], EV),
    ...overrides,
  });
}

describe("import pipeline (synthetic fixtures)", () => {
  it("imports, and repeated imports never duplicate records", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    src.write("2026-01-10_alder_ridge_invitational_c", baseTournament());
    const db = tempDb();
    const first = await importAll(db, src);
    expect(first.added).toBe(1);
    const counts = () => ({
      t: q1<{ c: number }>(db, "SELECT COUNT(*) c FROM tournaments").c,
      e: q1<{ c: number }>(db, "SELECT COUNT(*) c FROM entries").c,
      r: q1<{ c: number }>(db, "SELECT COUNT(*) c FROM event_results").c,
      o: q1<{ c: number }>(db, "SELECT COUNT(*) c FROM observations").c,
      s: q1<{ c: number }>(db, "SELECT COUNT(*) c FROM schools").c,
    });
    const before = counts();
    const second = await importAll(db, src);
    expect(second.unchanged).toBe(1);
    expect(second.added + second.changed).toBe(0);
    expect(second.earliestAffectedDate).toBeNull();
    expect(counts()).toEqual(before);
    expect(before).toMatchObject({ t: 1, e: 4, r: 12 });
  });

  it("detects corrected results by content hash and marks the earliest affected date", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    src.write("2026-01-10_alder_ridge_invitational_c", baseTournament());
    src.write(
      "2026-02-14_birch_hollow_invitational_c",
      baseTournament({ name: "Birch Hollow Invitational", date: "2026-02-14" }),
    );
    const db = tempDb();
    await importAll(db, src);
    // Correct the January file: teams 3 and 1 swap in Codebusters.
    const corrected = baseTournament({
      placings: straightPlacings([1, 3, 2, 4], ["Anatomy and Physiology", "Circuit Lab"]).concat(
        straightPlacings([3, 1, 2, 4], ["Codebusters"]),
      ),
    });
    src.write("2026-01-10_alder_ridge_invitational_c", corrected);
    const res = await importAll(db, src);
    expect(res.changed).toBe(1);
    expect(res.earliestAffectedDate).toBe("2026-01-10");
    const change = q1<{ change: string; old_hash: string; new_hash: string }>(
      db,
      "SELECT change, old_hash, new_hash FROM import_changes WHERE change='changed'",
    );
    expect(change.old_hash).not.toBe(change.new_hash);
    const prov = q1<Record<string, string>>(db, "SELECT * FROM source_files WHERE id='2026-01-10_alder_ridge_invitational_c'");
    expect(prov.content_hash).toBe(change.new_hash);
    expect(prov.result_url).toBe("https://www.duosmium.org/results/2026-01-10_alder_ridge_invitational_c/");
    expect(prov.parser_version).toBeTruthy();
    expect(prov.fetched_at).toBeTruthy();
    expect(q1<{ c: number }>(db, "SELECT COUNT(*) c FROM tournaments").c).toBe(2);
  });

  it("quarantines invalid files without aborting good imports", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    src.write("2026-01-10_alder_ridge_invitational_c", baseTournament());
    src.write("2026-01-17_broken_invitational_c", "Tournament: [this is not sciolyff\n");
    const db = tempDb();
    const res = await importAll(db, src);
    expect(res.added).toBe(1);
    expect(res.quarantined).toBe(1);
    expect(res.status).toBe("partial");
    const bad = q1<{ status: string; reason: string }>(db, "SELECT status, reason FROM source_files WHERE id='2026-01-17_broken_invitational_c'");
    expect(bad.status).toBe("quarantined");
    expect(bad.reason).toMatch(/validation|parse/i);
  });

  it("keeps divisions and seasons separate and skips files out of scope", async () => {
    const src = new SyntheticSource({ 2026: EV }, OFFICIAL);
    src.write("2026-01-10_alder_ridge_invitational_c", baseTournament());
    src.write("2026-01-10_alder_ridge_invitational_b", baseTournament({ division: "B" }));
    src.write("2023-01-10_old_invitational_c", baseTournament({ year: 2023, date: "2023-01-10" }));
    const db = tempDb();
    await importAll(db, src);
    const t = q<{ division: string }>(db, "SELECT division FROM tournaments ORDER BY division");
    expect(t.map((r) => r.division)).toEqual(["B", "C"]);
    const obs = q<{ division: string; entity_id: string }>(db, "SELECT DISTINCT division, entity_id FROM observations WHERE view='team'");
    for (const o of obs) expect(o.entity_id.startsWith(o.division.toLowerCase())).toBe(true);
    // Division B and C team-seasons of the same school are distinct entities.
    const ts = q<{ id: string }>(db, "SELECT id FROM team_seasons WHERE school_id LIKE 'alder-ridge%' ORDER BY id");
    expect(ts.length).toBe(4);
  });

  it("preserves official statuses and never treats missing data as zero", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    const placings = straightPlacings([1, 2, 3], ["Anatomy and Physiology", "Circuit Lab"]).concat([
      { team: 1, event: "Codebusters", place: 1 },
      { team: 2, event: "Codebusters", participated: false },
      { team: 3, event: "Codebusters", disqualified: true },
      { team: 4, event: "Codebusters", place: 2 },
      { team: 4, event: "Anatomy and Physiology", participated: true },
      { team: 4, event: "Circuit Lab", place: 4 },
    ]);
    src.write(
      "2026-01-10_alder_ridge_invitational_c",
      baseTournament({
        teams: [
          { number: 1, school: "Alder Ridge High School" },
          { number: 2, school: "Birch Hollow High School" },
          { number: 3, school: "Cedar Point Academy" },
          { number: 4, school: "Dogwood Middle College" },
        ],
        placings,
      }),
    );
    const db = tempDb();
    await importAll(db, src);
    const st = q<{ entry_id: string; status: string; place: number | null }>(
      db,
      "SELECT entry_id, status, place FROM event_results WHERE tournament_event_id LIKE '%:codebusters' ORDER BY entry_id",
    );
    expect(st.map((r) => r.status)).toEqual(["placed", "no_show", "disqualified", "placed"]);
    expect(st[1].place).toBeNull();
    const po = q1<{ status: string; place: number | null }>(
      db,
      "SELECT status, place FROM event_results WHERE entry_id LIKE '%#4' AND tournament_event_id LIKE '%:anatomy-and-physiology'",
    );
    expect(po.status).toBe("participation_only");
    // Non-participation is penalized in non-trial events: the no-show ranks
    // below every placed team and the DQ below the no-show (official order).
    const cb = q<{ n: number; model_rank: number; entity_id: string }>(
      db,
      "SELECT n, model_rank, entity_id FROM observations WHERE view='team' AND tournament_event_id LIKE '%:codebusters' ORDER BY model_rank",
    );
    expect(cb.map((r) => r.n)).toEqual([4, 4, 4, 4]);
    expect(cb.map((r) => r.model_rank)).toEqual([1, 2, 3, 4]);
    expect(cb[2].entity_id).toMatch(/birch-hollow/); // team 2: no-show
    expect(cb[3].entity_id).toMatch(/cedar-point/); // team 3: disqualified
    // Participation-only also ranks last in its event.
    const an = q<{ n: number; model_rank: number; entity_id: string }>(
      db,
      "SELECT n, model_rank, entity_id FROM observations WHERE view='team' AND tournament_event_id LIKE '%:anatomy-and-physiology' ORDER BY model_rank",
    );
    expect(an.map((r) => r.n)).toEqual([4, 4, 4, 4]);
    expect(an[3].entity_id).toMatch(/dogwood/);
  });

  it("does not penalize non-participation in trial events", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    const events = [{ name: "Anatomy and Physiology" }, { name: "Codebusters", trial: true }, { name: "Circuit Lab" }];
    const placings = straightPlacings([1, 2, 3], ["Anatomy and Physiology", "Circuit Lab"]).concat([
      { team: 1, event: "Codebusters", place: 1 },
      { team: 2, event: "Codebusters", place: 2 },
      { team: 3, event: "Codebusters", participated: false },
    ]);
    src.write(
      "2026-01-10_alder_ridge_invitational_c",
      baseTournament({
        events,
        teams: [
          { number: 1, school: "Alder Ridge High School" },
          { number: 2, school: "Birch Hollow High School" },
          { number: 3, school: "Cedar Point Academy" },
        ],
        placings,
      }),
    );
    const db = tempDb();
    await importAll(db, src);
    const cb = q<{ n: number }>(db, "SELECT n FROM observations WHERE view='team' AND tournament_event_id LIKE '%:codebusters'");
    expect(cb.map((r) => r.n)).toEqual([2, 2]);
  });

  it("uses midranks for official ties after exclusions and preserves the tie flag", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    const placings = straightPlacings([1, 2, 3, 4], ["Anatomy and Physiology", "Circuit Lab"]).concat([
      { team: 1, event: "Codebusters", place: 1 },
      { team: 2, event: "Codebusters", place: 2, tie: true },
      { team: 3, event: "Codebusters", place: 2, tie: true },
      { team: 4, event: "Codebusters", place: 4 },
    ]);
    src.write("2026-01-10_alder_ridge_invitational_c", baseTournament({
      teams: [
        { number: 1, school: "Alder Ridge High School" },
        { number: 2, school: "Birch Hollow High School" },
        { number: 3, school: "Cedar Point Academy" },
        { number: 4, school: "Dogwood Middle College" },
      ],
      placings,
    }));
    const db = tempDb();
    await importAll(db, src);
    const ties = q<{ tie: number }>(db, "SELECT tie FROM event_results WHERE tournament_event_id LIKE '%:codebusters' AND place=2");
    expect(ties.every((t) => t.tie === 1)).toBe(true);
    const ranks = q<{ model_rank: number }>(db, "SELECT model_rank FROM observations WHERE view='team' AND tournament_event_id LIKE '%:codebusters' ORDER BY model_rank");
    expect(ranks.map((r) => r.model_rank)).toEqual([1, 2.5, 2.5, 4]);
  });

  it("superscores a school's entries within a tournament and re-ranks unique schools", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    // Alder Gold wins Anatomy; Alder Blue wins Codebusters; Birch is 2nd in both.
    const placings = [
      ...[1, 3, 2, 4].map((team, i) => ({ team, event: "Anatomy and Physiology", place: i + 1 })),
      ...[2, 3, 1, 4].map((team, i) => ({ team, event: "Codebusters", place: i + 1 })),
      ...[1, 2, 3, 4].map((team, i) => ({ team, event: "Circuit Lab", place: i + 1 })),
    ];
    src.write("2026-01-10_alder_ridge_invitational_c", baseTournament({ placings }));
    const db = tempDb();
    await importAll(db, src);
    const rows = q<{ entity_id: string; source_entry_id: string; source_place: number; model_rank: number; n: number }>(
      db,
      "SELECT entity_id, source_entry_id, source_place, model_rank, n FROM observations WHERE view='school' AND tournament_event_id LIKE '%:codebusters' ORDER BY model_rank",
    );
    expect(rows.map((r) => r.n)).toEqual([3, 3, 3]); // unique schools
    expect(rows[0].entity_id).toMatch(/^alder-ridge/);
    expect(rows[0].source_entry_id).toMatch(/#2$/); // provenance: Blue team
    expect(rows[1].entity_id).toMatch(/^birch-hollow/);
    expect(rows[1].source_place).toBe(2);
    expect(rows[2].model_rank).toBe(3); // Cedar: official 4th -> re-ranked 3rd
  });

  it("excludes unrelated trial events but counts an official event held as a trial", async () => {
    const src = new SyntheticSource({}, OFFICIAL);
    const events = [
      { name: "Anatomy and Physiology" },
      { name: "Codebusters", trial: true },
      { name: "Circuit Lab" },
      { name: "Pokemon Trivia", trial: true },
    ];
    src.write(
      "2026-01-10_alder_ridge_invitational_c",
      baseTournament({ events, placings: straightPlacings([1, 3, 2, 4], events.map((e) => e.name)) }),
    );
    const db = tempDb();
    await importAll(db, src);
    const te = q<{ name: string; model_eligible: number; model_note: string | null }>(
      db,
      "SELECT name, model_eligible, model_note FROM tournament_events ORDER BY ordinal",
    );
    expect(te.find((e) => e.name === "Codebusters")!.model_eligible).toBe(1);
    expect(te.find((e) => e.name === "Codebusters")!.model_note).toMatch(/trial/i);
    expect(te.find((e) => e.name === "Pokemon Trivia")!.model_eligible).toBe(0);
    // Official display results for the unrelated trial event are still stored.
    expect(q1<{ c: number }>(db, "SELECT COUNT(*) c FROM event_results WHERE tournament_event_id LIKE '%:pokemon-trivia'").c).toBe(4);
  });

  it("matches a real Duosmium file's official ordering to the SciolyFF interpreter", async () => {
    const text = fs.readFileSync("tests/fixtures/2026-01-10_hudson_invitational_c.yaml", "utf8");
    const parsed = parseSciolyff(text);
    const src = new SyntheticSource({}, { 2026: ["Anatomy and Physiology", "Astronomy"] });
    src.write("2026-01-10_hudson_invitational_c", text);
    const db = tempDb();
    await importAll(db, src);
    const ranked = q<{ number: number; rank: number; points: number }>(
      db,
      "SELECT number, rank, points FROM entries WHERE tournament_id='2026-01-10_hudson_invitational_c' ORDER BY rank",
    );
    expect(ranked.map((r) => r.number)).toEqual([...parsed.teams].sort((a, b) => a.rank! - b.rank!).map((t) => t.number));
    // Official totals are kept as official points (not a naive sum of places).
    const byNumber = new Map(parsed.teams.map((t) => [t.number, t]));
    for (const r of ranked) expect(r.points).toBe(byNumber.get(r.number)!.points);
    expect(parsed.worstPlacingsDropped).toBe(5);
  });
});

describe("identity resolution", () => {
  const base: Omit<RawEntry, "number" | "school" | "suffix" | "tournamentId"> = { city: "Springfield", state: "ZZ", division: "C", season: 2026 };
  it("does not merge same-named schools from different locations", () => {
    const r = resolveIdentities(
      [
        { ...base, tournamentId: "t1", number: 1, school: "Lincoln High School", suffix: null },
        { ...base, tournamentId: "t1", number: 2, school: "Lincoln High School", suffix: null, city: "Shelbyville" },
        { ...base, tournamentId: "t1", number: 3, school: "Lincoln High School", suffix: null, state: "YY" },
      ],
      emptyMappings(),
    );
    expect(r.schools.size).toBe(3);
  });

  it("keeps multiple teams from one school distinct, and team numbers are not identity", () => {
    const r = resolveIdentities(
      [
        { ...base, tournamentId: "t1", number: 1, school: "Alder Ridge High School", suffix: "Gold" },
        { ...base, tournamentId: "t1", number: 2, school: "Alder Ridge High School", suffix: "Blue" },
        { ...base, tournamentId: "t2", number: 2, school: "Alder Ridge High School", suffix: "Gold" },
        { ...base, tournamentId: "t2", number: 1, school: "Alder Ridge High School", suffix: "Blue" },
      ],
      emptyMappings(),
    );
    expect(r.teamSeasons.size).toBe(2);
    expect(r.entries.get("t1#1")!.teamSeasonId).toBe(r.entries.get("t2#2")!.teamSeasonId);
  });

  it("assigns unlabeled entries to the school's highest-ranking labeled team not already present", () => {
    const S = "Alder Ridge High School";
    const r = resolveIdentities(
      [
        // B finishes near the top of its fields; A near the bottom -> B is the top team.
        { ...base, tournamentId: "t0", number: 1, school: S, suffix: "B", rank: 1, fieldSize: 10 },
        { ...base, tournamentId: "t0", number: 2, school: S, suffix: "A", rank: 8, fieldSize: 10 },
        // t1: B is present, so the unlabeled entry joins the next-best team (A).
        { ...base, tournamentId: "t1", number: 1, school: S, suffix: null, rank: 3, fieldSize: 10 },
        { ...base, tournamentId: "t1", number: 2, school: S, suffix: "B", rank: 1, fieldSize: 10 },
        // t2: a sole unlabeled entry joins the top team (B).
        { ...base, tournamentId: "t2", number: 9, school: S, suffix: null, rank: 2, fieldSize: 10 },
        // t3: two unlabeled entries, A and B both absent: best finisher -> B, next -> A.
        { ...base, tournamentId: "t3", number: 5, school: S, suffix: null, rank: 6, fieldSize: 10 },
        { ...base, tournamentId: "t3", number: 4, school: S, suffix: null, rank: 2, fieldSize: 10 },
      ],
      emptyMappings(),
    );
    const id = (k: string) => r.entries.get(k)!.teamSeasonId;
    expect(id("t1#1")).toBe(id("t0#2")); // A
    expect(id("t2#9")).toBe(id("t0#1")); // B
    expect(id("t3#4")).toBe(id("t0#1")); // best finisher -> B
    expect(id("t3#5")).toBe(id("t0#2")); // next -> A
    expect([...r.teamSeasons.values()].some((t) => t.designation === "")).toBe(false);
  });

  it("keeps an 'unlabeled' team only when a school has no labeled team that season", () => {
    const r = resolveIdentities(
      [
        { ...base, tournamentId: "t1", number: 1, school: "Birch Hollow High School", suffix: null, rank: 2, fieldSize: 5 },
        { ...base, tournamentId: "t2", number: 3, school: "Birch Hollow High School", suffix: null, rank: 1, fieldSize: 5 },
        // Two unlabeled entries at one tournament with no labeled team: unresolved.
        { ...base, tournamentId: "t3", number: 1, school: "Cedar Point Academy", suffix: null },
        { ...base, tournamentId: "t3", number: 2, school: "Cedar Point Academy", suffix: null },
      ],
      emptyMappings(),
    );
    expect(r.entries.get("t1#1")!.teamSeasonId).toMatch(/--unlabeled$/);
    expect(r.entries.get("t1#1")!.teamSeasonId).toBe(r.entries.get("t2#3")!.teamSeasonId);
    expect(r.entries.get("t3#1")!.resolution).toBe("unresolved");
  });

  it("applies reviewed mappings for aliases, entries, and merges", () => {
    const m = emptyMappings();
    m.schoolAliases.aliases.push({
      from: { name: "Alder Ridge H.S.", city: "Springfield", state: "ZZ" },
      to: { name: "Alder Ridge High School", city: "Springfield", state: "ZZ" },
      reason: "test",
    });
    m.teamIdentity.entries.push({ tournament: "t1", number: 1, designation: "Gold", reason: "host confirmed" });
    const r = resolveIdentities(
      [
        { ...base, tournamentId: "t1", number: 1, school: "Alder Ridge H.S.", suffix: null },
        { ...base, tournamentId: "t1", number: 2, school: "Alder Ridge High School", suffix: "Blue" },
        { ...base, tournamentId: "t2", number: 1, school: "Alder Ridge High School", suffix: "Gold" },
      ],
      m,
    );
    expect(r.schools.size).toBe(1);
    expect(r.entries.get("t1#1")!.teamSeasonId).toBe(r.entries.get("t2#1")!.teamSeasonId);
    expect(schoolMatchKey({ name: "Alder Ridge H.S.", city: "Springfield", state: "zz" })).toBe("alder ridge h s|springfield|ZZ");
  });
});
