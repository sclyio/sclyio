import "server-only";
import { cache } from "react";
import { all, DataUnavailableError, get } from "../db/read";
import type { RatingView } from "../rating/config";

export { DataUnavailableError };
export { all, get };

/** Per-request memoized key/value lookup. */
export const kv = cache(async (key: string): Promise<string | null> => {
  const r = await get<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, [key]);
  return r?.value ?? null;
});

export const buildId = cache(async (): Promise<number> => {
  const v = await kv("published_build_id");
  if (!v) throw new DataUnavailableError("no published rating build");
  return Number(v);
});

export interface SnapshotRow {
  id: number;
  division: string;
  view: RatingView;
  season: number;
  as_of: string;
  official_events: number;
  entity_count: number;
  established_count: number;
  excluded_counts: string;
  has_event_detail: number;
  diagnostics?: string;
}

export const snapshotsFor = cache(async (division: string, view: RatingView, season: number): Promise<SnapshotRow[]> => {
  return all<SnapshotRow>(
    `SELECT id, division, view, season, as_of, official_events, entity_count, established_count, excluded_counts, has_event_detail
     FROM snapshots WHERE build_id = ? AND division = ? AND view = ? AND season = ? ORDER BY as_of`,
    [await buildId(), division, view, season],
  );
});

export const seasonsFor = cache(async (division: string): Promise<number[]> => {
  const rows = await all<{ season: number }>(
    `SELECT DISTINCT season FROM snapshots WHERE build_id = ? AND division = ? ORDER BY season DESC`,
    [await buildId(), division],
  );
  return rows.map((r) => r.season);
});

/** Latest snapshot on or before asOf (or the latest overall). */
export function pickSnapshot(snaps: SnapshotRow[], asOf?: string | null, needDetail = false): SnapshotRow | null {
  const pool = needDetail ? snaps.filter((s) => s.has_event_detail) : snaps;
  if (!pool.length) return null;
  if (!asOf) return pool[pool.length - 1];
  const le = pool.filter((s) => s.as_of <= asOf);
  return le.length ? le[le.length - 1] : pool[0];
}

export interface EntityLabel {
  id: string;
  view: RatingView;
  schoolId: string;
  schoolName: string;
  city: string | null;
  state: string;
  designation: string | null; // team view only; "" = unlabeled
  division?: string;
  /** Team view: seasons the team competed in (first..last). */
  firstSeason?: number;
  season?: number;
}

export const entityLabel = cache(async (view: RatingView, id: string): Promise<EntityLabel | null> => {
  if (view === "school") {
    const r = await get<{ id: string; name: string; city: string | null; state: string }>(
      `SELECT id, name, city, state FROM schools WHERE id = ?`,
      [id],
    );
    return r ? { id, view, schoolId: r.id, schoolName: r.name, city: r.city, state: r.state, designation: null } : null;
  }
  const r = await get<{ d: string; division: string; first: number; last: number; sid: string; name: string; city: string | null; state: string }>(
    `SELECT tm.display_designation AS d, tm.division, tm.first_season AS first, tm.last_season AS last, sc.id AS sid, sc.name, sc.city, sc.state
     FROM teams tm JOIN schools sc ON sc.id = tm.school_id WHERE tm.id = ?`,
    [id],
  );
  return r
    ? {
        id,
        view,
        schoolId: r.sid,
        schoolName: r.name,
        city: r.city,
        state: r.state,
        designation: r.d,
        division: r.division,
        firstSeason: r.first,
        season: r.last,
      }
    : null;
});

export const officialEvents = cache(
  async (division: string, season: number): Promise<{ id: string; name: string; equivalence_group: string | null }[]> =>
    all(`SELECT id, name, equivalence_group FROM event_definitions WHERE division = ? AND season = ? AND official = 1 ORDER BY name`, [
      division,
      season,
    ]),
);

export function normQuery(q: string): string {
  return q
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const states = cache(async (): Promise<string[]> =>
  (await all<{ state: string }>(`SELECT DISTINCT state FROM schools ORDER BY state`)).map((r) => r.state),
);
