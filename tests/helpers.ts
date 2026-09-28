/**
 * SYNTHETIC test data builders. All schools here are fictional; these
 * fixtures exist only for automated tests and are never imported into the
 * site database.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "../src/lib/db/client";
import { emptyMappings, type Mappings } from "../src/lib/identity/mappings";
import { runImport } from "../src/lib/import/importer";
import { LocalDirectoryAdapter } from "../src/lib/source/duosmium";

export interface SynthTeam {
  number: number;
  school: string;
  city?: string;
  state?: string;
  suffix?: string;
  exhibition?: boolean;
}

export interface SynthPlacing {
  team: number;
  event: string;
  place?: number;
  tie?: boolean;
  participated?: boolean;
  disqualified?: boolean;
  exempt?: boolean;
}

export function sciolyff(opts: {
  name: string;
  division: "B" | "C";
  year: number;
  date: string;
  level?: string;
  events: { name: string; trial?: boolean }[];
  teams: SynthTeam[];
  placings: SynthPlacing[];
}): string {
  return yaml.dump({
    Tournament: {
      name: opts.name,
      "short name": opts.name.split(" ")[0],
      location: "Fictional Campus",
      state: "ZZ",
      level: opts.level ?? "Invitational",
      division: opts.division,
      year: opts.year,
      medals: 3,
      trophies: 3,
      "start date": opts.date,
      "end date": opts.date,
      "awards date": opts.date,
    },
    Events: opts.events.map((e) => (e.trial ? { name: e.name, trial: true } : { name: e.name })),
    Teams: opts.teams.map((t) => ({
      number: t.number,
      school: t.school,
      ...(t.suffix ? { suffix: t.suffix } : {}),
      city: t.city ?? "Springfield",
      state: t.state ?? "ZZ",
      ...(t.exhibition ? { exhibition: true } : {}),
    })),
    Placings: opts.placings.map((p) => ({
      team: p.team,
      event: p.event,
      ...(p.place !== undefined ? { place: p.place } : {}),
      ...(p.tie ? { tie: true } : {}),
      ...(p.participated === false ? { participated: false } : {}),
      ...(p.disqualified ? { disqualified: true } : {}),
      ...(p.exempt ? { exempt: true } : {}),
    })),
  });
}

/** Full placings for teams in the given order for every event (1..n). */
export function straightPlacings(order: number[], events: string[]): SynthPlacing[] {
  const out: SynthPlacing[] = [];
  for (const e of events) order.forEach((team, i) => out.push({ team, event: e, place: i + 1 }));
  return out;
}

export class SyntheticSource {
  dir: string;
  constructor(eventsB: Record<number, string[]> = {}, eventsC: Record<number, string[]> = {}) {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), "sclyio-src-"));
    fs.mkdirSync(path.join(this.dir, "results"));
    const csv = (m: Record<number, string[]>) =>
      Object.entries(m)
        .map(([y, ev]) => [y, ...ev].join(","))
        .join("\n");
    fs.writeFileSync(path.join(this.dir, "events-b.csv"), csv(eventsB));
    fs.writeFileSync(path.join(this.dir, "events-c.csv"), csv(eventsC));
    fs.writeFileSync(path.join(this.dir, "preliminary.yaml"), "[]\n");
  }
  write(id: string, content: string) {
    fs.writeFileSync(path.join(this.dir, "results", `${id}.yaml`), content);
  }
  remove(id: string) {
    fs.rmSync(path.join(this.dir, "results", `${id}.yaml`));
  }
  adapter() {
    return new LocalDirectoryAdapter(this.dir);
  }
}

export function tempDb(): DB {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sclyio-db-"));
  const db = openDb(path.join(dir, "test.db"));
  migrate(db, { migrationsFolder: path.resolve("drizzle") });
  return db;
}

export async function importAll(db: DB, src: SyntheticSource, mappings: Mappings = emptyMappings(), seasons: number[] = [2026]) {
  return runImport({
    db,
    adapter: src.adapter(),
    mappings,
    mode: "full",
    seasons,
    divisions: ["B", "C"],
    concurrency: 2,
    today: "2026-09-27",
    log: () => {},
  });
}

export const q = <T = Record<string, unknown>>(db: DB, sql: string, ...args: unknown[]) =>
  db.$client.prepare(sql).all(...args) as T[];
export const q1 = <T = Record<string, unknown>>(db: DB, sql: string, ...args: unknown[]) =>
  db.$client.prepare(sql).get(...args) as T;
