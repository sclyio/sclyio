import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { sha256 } from "../source/duosmium";

/**
 * Version-controlled, reviewed mapping files in data/mappings. Every file is
 * validated; an invalid mapping aborts the job rather than silently being
 * ignored.
 */

const place = z.object({ name: z.string(), city: z.string().nullable().optional(), state: z.string() });

const SchoolAliases = z.object({
  aliases: z
    .array(z.object({ from: place, to: place, reason: z.string(), reviewed: z.string().optional() }))
    .default([]),
});

const TeamIdentity = z.object({
  entries: z
    .array(
      z.object({
        tournament: z.string(),
        number: z.number().int(),
        designation: z.string().optional(),
        unresolved: z.string().optional(),
        reason: z.string(),
      }),
    )
    .default([]),
  merges: z
    .array(
      z.object({
        school: z.string(),
        division: z.enum(["B", "C"]),
        season: z.number().int(),
        from: z.string(),
        into: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
});

const SourceOverrides = z.object({
  supersede: z
    .array(z.object({ file: z.string(), supersededBy: z.string(), reason: z.string() }))
    .default([]),
  exclude: z.array(z.object({ file: z.string(), reason: z.string() })).default([]),
  format: z
    .array(z.object({ file: z.string(), format: z.enum(["in-person", "online"]), basis: z.string() }))
    .default([]),
  canceledEvents: z
    .array(z.object({ file: z.string(), event: z.string(), reason: z.string() }))
    .default([]),
  withdrawnEntries: z
    .array(z.object({ file: z.string(), number: z.number().int(), reason: z.string() }))
    .default([]),
});

const EventEquivalence = z.object({
  groups: z
    .array(
      z.object({
        id: z.string(),
        division: z.enum(["B", "C"]),
        members: z.array(z.object({ season: z.number().int(), event: z.string() })).min(2),
        basis: z.string(),
      }),
    )
    .default([]),
});

export type SchoolAliasesT = z.infer<typeof SchoolAliases>;
export type TeamIdentityT = z.infer<typeof TeamIdentity>;
export type SourceOverridesT = z.infer<typeof SourceOverrides>;
export type EventEquivalenceT = z.infer<typeof EventEquivalence>;

export interface Mappings {
  schoolAliases: SchoolAliasesT;
  teamIdentity: TeamIdentityT;
  sourceOverrides: SourceOverridesT;
  eventEquivalence: EventEquivalenceT;
  /** Hash of all mapping files; a change triggers identity re-resolution. */
  fingerprint: string;
}

function load<T>(dir: string, file: string, schema: z.ZodType<T>): { value: T; text: string } {
  const p = path.join(dir, file);
  const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  const parsed = text.trim() ? yaml.load(text) : {};
  const res = schema.safeParse(parsed ?? {});
  if (!res.success) throw new Error(`Invalid mapping file ${file}: ${res.error.message}`);
  return { value: res.data, text };
}

export function loadMappings(dir = path.resolve("data/mappings")): Mappings {
  const a = load(dir, "school-aliases.yaml", SchoolAliases);
  const t = load(dir, "team-identity.yaml", TeamIdentity);
  const s = load(dir, "source-overrides.yaml", SourceOverrides);
  const e = load(dir, "event-equivalence.yaml", EventEquivalence);
  return {
    schoolAliases: a.value,
    teamIdentity: t.value,
    sourceOverrides: s.value,
    eventEquivalence: e.value,
    fingerprint: sha256(a.text + "\n--\n" + t.text + "\n--\n" + s.text + "\n--\n" + e.text),
  };
}

export function emptyMappings(): Mappings {
  return {
    schoolAliases: { aliases: [] },
    teamIdentity: { entries: [], merges: [] },
    sourceOverrides: { supersede: [], exclude: [], format: [], canceledEvents: [], withdrawnEntries: [] },
    eventEquivalence: { groups: [] },
    fingerprint: "empty",
  };
}
