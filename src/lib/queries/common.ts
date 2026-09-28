import "server-only";
import fs from "node:fs";
import { databasePath, readDb } from "../db/client";
import type { RatingView } from "../rating/config";

export class DataUnavailableError extends Error {
  constructor() {
    super("The scly.io database has not been built yet. Run `npm run setup` to import results and compute ratings.");
    this.name = "DataUnavailableError";
  }
}

export function sql() {
  if (!fs.existsSync(databasePath())) throw new DataUnavailableError();
  return readDb().$client;
}

export function kv(key: string): string | null {
  const r = sql().prepare(`SELECT value FROM kv WHERE key=?`).get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function buildId(): number {
  const v = kv("published_build_id");
  if (!v) throw new DataUnavailableError();
  return Number(v);
}

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

export function snapshotsFor(division: string, view: RatingView, season: number): SnapshotRow[] {
  return sql()
    .prepare(
      `SELECT id, division, view, season, as_of, official_events, entity_count, established_count, excluded_counts, has_event_detail
       FROM snapshots WHERE build_id=? AND division=? AND view=? AND season=? ORDER BY as_of`,
    )
    .all(buildId(), division, view, season) as SnapshotRow[];
}

export function seasonsFor(division: string): number[] {
  return (
    sql()
      .prepare(`SELECT DISTINCT season FROM snapshots WHERE build_id=? AND division=? ORDER BY season DESC`)
      .all(buildId(), division) as { season: number }[]
  ).map((r) => r.season);
}

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
  season?: number;
}

export function entityLabel(view: RatingView, id: string): EntityLabel | null {
  if (view === "school") {
    const r = sql().prepare(`SELECT id, name, city, state FROM schools WHERE id=?`).get(id) as
      | { id: string; name: string; city: string | null; state: string }
      | undefined;
    return r ? { id, view, schoolId: r.id, schoolName: r.name, city: r.city, state: r.state, designation: null } : null;
  }
  const r = sql()
    .prepare(
      `SELECT ts.id, ts.display_designation AS d, ts.division, ts.season, sc.id AS sid, sc.name, sc.city, sc.state
       FROM team_seasons ts JOIN schools sc ON sc.id = ts.school_id WHERE ts.id=?`,
    )
    .get(id) as
    | { id: string; d: string; division: string; season: number; sid: string; name: string; city: string | null; state: string }
    | undefined;
  return r
    ? { id, view, schoolId: r.sid, schoolName: r.name, city: r.city, state: r.state, designation: r.d, division: r.division, season: r.season }
    : null;
}

export function teamName(schoolName: string, designation: string | null | undefined): string {
  if (designation === null || designation === undefined) return schoolName;
  return designation ? `${schoolName} · ${designation}` : `${schoolName} · Unlabeled team`;
}

export function eventNames(): Map<string, string> {
  return new Map(
    (sql().prepare(`SELECT id, name FROM event_definitions`).all() as { id: string; name: string }[]).map((r) => [r.id, r.name]),
  );
}

export function officialEvents(division: string, season: number): { id: string; name: string; equivalence_group: string | null }[] {
  return sql()
    .prepare(`SELECT id, name, equivalence_group FROM event_definitions WHERE division=? AND season=? AND official=1 ORDER BY name`)
    .all(division, season) as { id: string; name: string; equivalence_group: string | null }[];
}

export function normQuery(q: string): string {
  return q
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function states(): string[] {
  return (sql().prepare(`SELECT DISTINCT state FROM schools ORDER BY state`).all() as { state: string }[]).map((r) => r.state);
}

export function params(): Record<string, number | string> {
  const r = sql().prepare(`SELECT params, model_version FROM rating_builds WHERE id=?`).get(buildId()) as {
    params: string;
    model_version: string;
  };
  return { ...JSON.parse(r.params), modelVersion: r.model_version };
}
