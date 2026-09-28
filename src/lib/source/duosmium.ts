import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fetchWithRetry, type RetryOptions } from "./http";
import { DUOSMIUM_RESULTS_BASE, type SourceAdapter, type SourceFileRef } from "./types";

/** Git blob SHA-1 of file content ("blob <len>\0<bytes>"). */
export function gitBlobSha(buf: Buffer): string {
  return createHash("sha1")
    .update(Buffer.from(`blob ${buf.length}\0`))
    .update(buf)
    .digest("hex");
}

export function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

const RESULT_FILE = /^(\d{4}-\d{2}-\d{2})_[A-Za-z0-9_\-]+\.yaml$/;

/**
 * Reads the public Duosmium repository through the GitHub git-data API
 * (one tree listing per sync) and raw.githubusercontent.com for file
 * bytes. Downloads are cached on disk by git blob SHA, so incremental syncs
 * only fetch files whose content changed. No results HTML is scraped.
 */
export class DuosmiumGitHubAdapter implements SourceAdapter {
  readonly name = "duosmium-github";
  private rev: string | null = null;
  constructor(
    private opts: {
      owner: string;
      repo: string;
      ref: string;
      cacheDir: string;
      token?: string;
      retry: RetryOptions;
      log: (m: string) => void;
    },
  ) {
    fs.mkdirSync(path.join(opts.cacheDir, "blobs"), { recursive: true });
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "scly.io-importer (+https://github.com/Duosmium/duosmium attribution)",
    };
    if (this.opts.token) h.Authorization = `Bearer ${this.opts.token}`;
    return h;
  }

  private async api<T>(p: string): Promise<T> {
    const url = `https://api.github.com/repos/${this.opts.owner}/${this.opts.repo}${p}`;
    const res = await fetchWithRetry(url, { headers: this.headers() }, this.opts.retry);
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${p}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async revision(): Promise<string> {
    if (!this.rev) {
      const c = await this.api<{ sha: string }>(`/commits/${encodeURIComponent(this.opts.ref)}`);
      this.rev = c.sha;
    }
    return this.rev;
  }

  private async subtree(sha: string, name: string): Promise<string> {
    const t = await this.api<{ tree: { path: string; type: string; sha: string }[] }>(`/git/trees/${sha}`);
    const hit = t.tree.find((e) => e.path === name && e.type === "tree");
    if (!hit) throw new Error(`Path component '${name}' not found in source tree`);
    return hit.sha;
  }

  async listResultFiles(): Promise<SourceFileRef[]> {
    const rev = await this.revision();
    const commit = await this.api<{ tree: { sha: string } }>(`/git/commits/${rev}`);
    const data = await this.subtree(commit.tree.sha, "data");
    const results = await this.subtree(data, "results");
    const t = await this.api<{ truncated: boolean; tree: { path: string; type: string; sha: string }[] }>(
      `/git/trees/${results}`,
    );
    if (t.truncated) this.opts.log("warning: results tree listing truncated by GitHub API");
    return t.tree
      .filter((e) => e.type === "blob" && RESULT_FILE.test(e.path))
      .map((e) => ({ id: e.path.replace(/\.yaml$/, ""), path: `data/results/${e.path}`, blobSha: e.sha }));
  }

  private raw(p: string): string {
    const rev = this.rev ?? this.opts.ref;
    return `https://raw.githubusercontent.com/${this.opts.owner}/${this.opts.repo}/${rev}/${p}`;
  }

  async readResultFile(ref: SourceFileRef): Promise<Buffer> {
    const cached = ref.blobSha ? path.join(this.opts.cacheDir, "blobs", `${ref.blobSha}.yaml`) : null;
    if (cached && fs.existsSync(cached)) return fs.readFileSync(cached);
    await this.revision();
    const res = await fetchWithRetry(this.raw(ref.path), { headers: { "User-Agent": "scly.io-importer" } }, this.opts.retry);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${ref.path}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (ref.blobSha && gitBlobSha(buf) !== ref.blobSha) {
      throw new Error(`Content for ${ref.path} does not match git blob ${ref.blobSha}`);
    }
    if (cached) fs.writeFileSync(cached, buf);
    return buf;
  }

  async readDataFile(name: string): Promise<string | null> {
    await this.revision();
    const res = await fetchWithRetry(this.raw(`data/${name}`), { headers: { "User-Agent": "scly.io-importer" } }, this.opts.retry);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching data/${name}`);
    return await res.text();
  }

  resultUrl(id: string): string {
    return `${DUOSMIUM_RESULTS_BASE}${id}/`;
  }
}

/**
 * Offline path: reads a local checkout (or copy) of the Duosmium `data`
 * directory. Revision comes from `git rev-parse HEAD` when available.
 */
export class LocalDirectoryAdapter implements SourceAdapter {
  readonly name = "local";
  constructor(private dataDir: string) {
    if (!fs.existsSync(path.join(dataDir, "results"))) {
      throw new Error(`${dataDir} does not contain a results/ directory`);
    }
  }
  async revision(): Promise<string | null> {
    try {
      return execFileSync("git", ["-C", this.dataDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  }
  async listResultFiles(): Promise<SourceFileRef[]> {
    return fs
      .readdirSync(path.join(this.dataDir, "results"))
      .filter((f) => RESULT_FILE.test(f))
      .map((f) => ({ id: f.replace(/\.yaml$/, ""), path: `data/results/${f}` }));
  }
  async readResultFile(ref: SourceFileRef): Promise<Buffer> {
    return fs.readFileSync(path.join(this.dataDir, "results", `${ref.id}.yaml`));
  }
  async readDataFile(name: string): Promise<string | null> {
    const p = path.join(this.dataDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }
  resultUrl(id: string): string {
    return `${DUOSMIUM_RESULTS_BASE}${id}/`;
  }
}

/** Parse Duosmium's events-{b,c}.csv: "<season>,<event>,<event>,..." per line. */
export function parseEventsCsv(text: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(",").map((c) => c.trim());
    const season = Number(cells[0]);
    if (!Number.isInteger(season)) continue;
    out.set(season, cells.slice(1).filter(Boolean));
  }
  return out;
}

/** Filename date → Science Olympiad season (season Y runs Jul 1, Y-1 to Jun 30, Y). */
export function seasonForDate(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 7 ? y + 1 : y;
}

export function fileDate(id: string): string {
  return id.slice(0, 10);
}

/** Division suffix encoded in Duosmium file names (…_b / …_c). */
export function fileDivision(id: string): string | null {
  const m = id.match(/_([abc])$/i);
  return m ? m[1].toUpperCase() : null;
}
