import { createClient, type Client } from "@libsql/client";

/**
 * Atomic dataset publishing to Turso.
 *
 *  1. Create a new database seeded for upload (Platform API).
 *  2. Upload the exported SQLite file to that database's /v1/upload endpoint.
 *  3. Verify the uploaded dataset (published build id, non-empty ratings).
 *  4. Flip the one-row pointer in the meta database (single statement).
 *  5. Delete older dataset databases, keeping the newest `keep` (the active one
 *     plus at least one previous for app instances with a cached pointer).
 *
 * The pointer only moves after verification, so a failed upload never reaches
 * visitors; the half-created database is deleted.
 */

export interface PublishOptions {
  apiToken: string; // Turso Platform API token
  org: string; // organization slug
  group: string; // database group (e.g. "default")
  metaDb: string; // meta database name (e.g. "sclyio-meta")
  prefix: string; // dataset database name prefix (e.g. "sclyio-data")
  keep: number; // dataset databases to keep, >= 2
  file: Blob; // exported SQLite file (WAL mode, checkpointed)
  expectedBuildId: number;
  sourceRevision: string | null;
  /** Identifies the dataset contents (build id + build timestamp). */
  marker: string;
  /** Skip the upload when the active dataset already has this marker. */
  skipIfCurrent?: boolean;
  now?: Date;
  log: (m: string) => void;
  fetchImpl?: typeof fetch;
  connect?: (url: string, token: string) => Pick<Client, "execute" | "close">;
  pollAttempts?: number;
  pollDelayMs?: number;
}

const API = "https://api.turso.tech/v1";

interface DbInfo {
  Name: string;
  Hostname: string;
}

export function datasetName(prefix: string, buildId: number, now: Date): string {
  // yyyymmddhhmmss keeps lexical order == chronological order.
  const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${prefix}-${ts}-b${buildId}`.toLowerCase().slice(0, 64);
}

export async function publishToTurso(o: PublishOptions) {
  const f = o.fetchImpl ?? fetch;
  const connect = o.connect ?? ((url: string, token: string) => createClient({ url, authToken: token, intMode: "number" }));
  const keep = Math.max(2, o.keep);
  const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await f(`${API}/organizations/${encodeURIComponent(o.org)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${o.apiToken}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Turso API ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  };
  const token = async (db: string, access: "full-access" | "read-only") =>
    (await api<{ jwt: string }>("POST", `/databases/${encodeURIComponent(db)}/auth/tokens?expiration=2h&authorization=${access}`)).jwt;

  // Meta database (created on first publish).
  const list = async () => (await api<{ databases: (DbInfo & { group?: string })[] }>("GET", "/databases")).databases;
  let dbs = await list();
  let meta = dbs.find((d) => d.Name === o.metaDb);
  if (!meta) {
    o.log(`creating meta database ${o.metaDb}`);
    meta = (await api<{ database: DbInfo }>("POST", "/databases", { name: o.metaDb, group: o.group })).database;
  }

  const metaJwt = await token(o.metaDb, "full-access");
  const metaUrl = `libsql://${meta.Hostname}`;
  const ensureMetaSchema = async (m: Pick<Client, "execute">) => {
    await m.execute(
      `CREATE TABLE IF NOT EXISTS active_dataset (id INTEGER PRIMARY KEY CHECK (id = 1), db_name TEXT NOT NULL, db_url TEXT NOT NULL,
        build_id INTEGER NOT NULL, source_revision TEXT, marker TEXT, published_at TEXT NOT NULL)`,
    );
    await m.execute(
      `CREATE TABLE IF NOT EXISTS dataset_log (id INTEGER PRIMARY KEY AUTOINCREMENT, db_name TEXT NOT NULL, db_url TEXT NOT NULL,
        build_id INTEGER NOT NULL, source_revision TEXT, marker TEXT, published_at TEXT NOT NULL)`,
    );
  };
  if (o.skipIfCurrent) {
    const m = connect(metaUrl, metaJwt);
    try {
      await ensureMetaSchema(m);
      const cur = await m.execute("SELECT marker, db_name FROM active_dataset WHERE id = 1");
      const row = cur.rows[0] as Record<string, unknown> | undefined;
      if (row && row.marker === o.marker && dbs.some((d) => d.Name === row.db_name)) {
        o.log(`active dataset ${String(row.db_name)} already has marker ${o.marker}; nothing to publish`);
        return { name: String(row.db_name), url: "", removed: [] as string[], skipped: true };
      }
    } finally {
      m.close();
    }
  }

  // 1. New dataset database.
  const name = datasetName(o.prefix, o.expectedBuildId, o.now ?? new Date());
  o.log(`creating dataset database ${name}`);
  const created = (await api<{ database: DbInfo }>("POST", "/databases", { name, group: o.group, seed: { type: "database_upload" } }))
    .database;
  const url = `libsql://${created.Hostname}`;
  try {
    // 2. Upload.
    const jwt = await token(name, "full-access");
    o.log(`uploading ${(o.file.size / 1e6).toFixed(0)} MB to ${created.Hostname}`);
    const up = await f(`https://${created.Hostname}/v1/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: o.file,
    });
    if (!up.ok) throw new Error(`upload failed → ${up.status}: ${(await up.text()).slice(0, 300)}`);

    // 3. Verify (the database may take a moment to become queryable).
    const attempts = o.pollAttempts ?? 20;
    let verified = false;
    let lastErr: unknown = null;
    for (let i = 0; i < attempts && !verified; i++) {
      const c = connect(url, jwt);
      try {
        const b = await c.execute("SELECT value FROM kv WHERE key = 'published_build_id'");
        const r = await c.execute("SELECT COUNT(*) AS c FROM overall_ratings");
        const got = Number(b.rows[0]?.value ?? b.rows[0]?.[0]);
        const count = Number(r.rows[0]?.c ?? r.rows[0]?.[0]);
        if (got !== o.expectedBuildId) throw new Error(`build id mismatch: expected ${o.expectedBuildId}, got ${got}`);
        if (!(count > 0)) throw new Error("uploaded dataset has no ratings");
        verified = true;
        o.log(`verified: build ${got}, ${count.toLocaleString()} overall ratings`);
      } catch (e) {
        lastErr = e;
        if (e instanceof Error && e.message.startsWith("build id mismatch")) throw e;
        await new Promise((r) => setTimeout(r, o.pollDelayMs ?? 3000));
      } finally {
        c.close();
      }
    }
    if (!verified) throw new Error(`dataset not queryable after upload: ${String(lastErr)}`);
  } catch (e) {
    o.log(`publish failed; deleting ${name}`);
    await api("DELETE", `/databases/${encodeURIComponent(name)}`).catch(() => {});
    throw e;
  }

  // 4. Flip the pointer (one upsert; readers see old or new, never partial).
  const m = connect(metaUrl, metaJwt);
  try {
    await ensureMetaSchema(m);
    const at = new Date().toISOString();
    const args = [name, url, o.expectedBuildId, o.sourceRevision, o.marker, at];
    await m.execute({
      sql: `INSERT INTO active_dataset (id, db_name, db_url, build_id, source_revision, marker, published_at) VALUES (1, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET db_name = excluded.db_name, db_url = excluded.db_url, build_id = excluded.build_id,
              source_revision = excluded.source_revision, marker = excluded.marker, published_at = excluded.published_at`,
      args,
    });
    await m.execute({
      sql: `INSERT INTO dataset_log (db_name, db_url, build_id, source_revision, marker, published_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args,
    });
  } finally {
    m.close();
  }
  o.log(`active dataset → ${name}`);

  // 5. Prune older datasets (names sort chronologically).
  dbs = await list();
  const datasets = dbs
    .map((d) => d.Name)
    .filter((n) => n.startsWith(`${o.prefix}-`))
    .sort()
    .reverse();
  const removed: string[] = [];
  for (const old of datasets.slice(keep)) {
    if (old === name) continue;
    await api("DELETE", `/databases/${encodeURIComponent(old)}`);
    removed.push(old);
  }
  if (removed.length) o.log(`deleted old datasets: ${removed.join(", ")}`);
  return { name, url, removed, skipped: false };
}
