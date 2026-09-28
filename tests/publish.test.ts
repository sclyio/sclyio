import { describe, expect, it } from "vitest";
import { datasetName, publishToTurso } from "../src/lib/publish/turso";

/** In-memory fake of the Turso Platform API + database endpoints. */
function fakeTurso(opts: { buildInUpload: number; failUpload?: boolean; existing?: string[] }) {
  const dbs = new Map<string, { Hostname: string; uploaded: boolean }>();
  for (const n of opts.existing ?? []) dbs.set(n, { Hostname: `${n}-org.turso.io`, uploaded: true });
  const calls: string[] = [];
  const pointer: { value: unknown[] | null } = { value: null };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.replace("https://api.turso.tech/v1/organizations/org", "")}`);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.endsWith("/upload")) {
      const host = new URL(url).host;
      const entry = [...dbs.values()].find((d) => d.Hostname === host)!;
      if (opts.failUpload) return new Response("boom", { status: 500 });
      entry.uploaded = true;
      return json({});
    }
    const m = url.match(/\/databases(?:\/([^/?]+))?(\/auth\/tokens)?/)!;
    if (m[2]) return json({ jwt: `jwt-${m[1]}` });
    if (method === "GET") return json({ databases: [...dbs.entries()].map(([Name, d]) => ({ Name, Hostname: d.Hostname })) });
    if (method === "POST") {
      const body = JSON.parse(String(init!.body));
      const d = { Hostname: `${body.name}-org.turso.io`, uploaded: false };
      dbs.set(body.name, d);
      return json({ database: { Name: body.name, Hostname: d.Hostname, DbId: "x" } });
    }
    if (method === "DELETE") {
      dbs.delete(decodeURIComponent(m[1]));
      return json({});
    }
    return json({}, 404);
  }) as typeof fetch;
  const connect = (url: string) => ({
    close: () => {},
    execute: async (stmt: unknown) => {
      const sqlText = typeof stmt === "string" ? stmt : (stmt as { sql: string }).sql;
      if (url.includes("sclyio-meta")) {
        if (sqlText.startsWith("INSERT INTO active_dataset")) {
          pointer.value = (stmt as { args: unknown[] }).args;
          calls.push("POINTER");
        }
        if (sqlText.startsWith("SELECT marker")) {
          return { rows: pointer.value ? [{ marker: pointer.value[4], db_name: pointer.value[0] }] : [] } as never;
        }
        return { rows: [] } as never;
      }
      if (sqlText.includes("published_build_id")) return { rows: [{ value: String(opts.buildInUpload) }] } as never;
      return { rows: [{ c: 1234 }] } as never;
    },
  });
  return { fetchImpl, connect, dbs, calls, pointer };
}

const base = {
  apiToken: "t",
  org: "org",
  group: "default",
  metaDb: "sclyio-meta",
  prefix: "sclyio-data",
  keep: 2,
  file: new Blob([new Uint8Array(10)]),
  sourceRevision: "abc",
  marker: "7@2026-09-27T00:00:00Z",
  log: () => {},
  pollDelayMs: 1,
};

describe("Turso publishing", () => {
  it("names datasets so lexical order is chronological", () => {
    const a = datasetName("sclyio-data", 3, new Date("2026-09-27T01:02:03Z"));
    const b = datasetName("sclyio-data", 3, new Date("2026-10-01T00:00:00Z"));
    expect(a).toBe("sclyio-data-20260927010203-b3");
    expect(a < b).toBe(true);
  });

  it("uploads, verifies, flips the pointer, and prunes older datasets", async () => {
    const t = fakeTurso({ buildInUpload: 7, existing: ["sclyio-data-20260101000000-b5", "sclyio-data-20260201000000-b6", "unrelated-db"] });
    const r = await publishToTurso({ ...base, expectedBuildId: 7, now: new Date("2026-09-27T00:00:00Z"), fetchImpl: t.fetchImpl, connect: t.connect });
    expect(r.name).toBe("sclyio-data-20260927000000-b7");
    expect(t.pointer.value?.[0]).toBe(r.name);
    expect(t.pointer.value?.[1]).toBe(`libsql://${r.name}-org.turso.io`);
    // Keeps the new dataset plus one previous; unrelated databases untouched.
    expect([...t.dbs.keys()].sort()).toEqual(["sclyio-data-20260201000000-b6", "sclyio-data-20260927000000-b7", "sclyio-meta", "unrelated-db"]);
    // Pointer is flipped only after the upload.
    const uploadIdx = t.calls.findIndex((c) => c.endsWith("/v1/upload"));
    const pointerIdx = t.calls.indexOf("POINTER");
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(pointerIdx).toBeGreaterThan(uploadIdx);
  });

  it("never moves the pointer when verification fails, and removes the new database", async () => {
    const t = fakeTurso({ buildInUpload: 6, existing: ["sclyio-data-20260201000000-b6"] });
    await expect(
      publishToTurso({ ...base, expectedBuildId: 7, now: new Date("2026-09-27T00:00:00Z"), fetchImpl: t.fetchImpl, connect: t.connect }),
    ).rejects.toThrow(/build id mismatch/);
    expect(t.pointer.value).toBeNull();
    expect(t.dbs.has("sclyio-data-20260927000000-b7")).toBe(false);
    expect(t.dbs.has("sclyio-data-20260201000000-b6")).toBe(true);
  });

  it("skips the upload when the active dataset already has the same marker", async () => {
    const t = fakeTurso({ buildInUpload: 7 });
    const opts = { ...base, expectedBuildId: 7, now: new Date("2026-09-27T00:00:00Z"), fetchImpl: t.fetchImpl, connect: t.connect, skipIfCurrent: true };
    const first = await publishToTurso(opts);
    expect(first.skipped).toBe(false);
    const uploads = t.calls.filter((c) => c.endsWith("/v1/upload")).length;
    const second = await publishToTurso({ ...opts, now: new Date("2026-09-28T00:00:00Z") });
    expect(second.skipped).toBe(true);
    expect(t.calls.filter((c) => c.endsWith("/v1/upload")).length).toBe(uploads);
    // A new build marker publishes again.
    const third = await publishToTurso({ ...opts, marker: "8@x", expectedBuildId: 7, now: new Date("2026-09-29T00:00:00Z") });
    expect(third.skipped).toBe(false);
  });

  it("never moves the pointer when the upload fails", async () => {
    const t = fakeTurso({ buildInUpload: 7, failUpload: true });
    await expect(
      publishToTurso({ ...base, expectedBuildId: 7, fetchImpl: t.fetchImpl, connect: t.connect }),
    ).rejects.toThrow(/upload failed/);
    expect(t.pointer.value).toBeNull();
  });
});
