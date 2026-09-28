import path from "node:path";
import { DuosmiumGitHubAdapter, LocalDirectoryAdapter } from "../src/lib/source/duosmium";
import type { SourceAdapter } from "../src/lib/source/types";

/** Minimal --flag value parser shared by the CLI scripts. */
export function args(argv = process.argv.slice(2)) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

export function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

export function makeAdapter(a: Record<string, string | boolean>): SourceAdapter {
  const local = (a.local as string) || process.env.DUOSMIUM_LOCAL_PATH;
  if (local) return new LocalDirectoryAdapter(path.resolve(local));
  return new DuosmiumGitHubAdapter({
    owner: process.env.DUOSMIUM_OWNER ?? "Duosmium",
    repo: process.env.DUOSMIUM_REPO ?? "duosmium",
    ref: process.env.DUOSMIUM_REF ?? "main",
    cacheDir: path.resolve(process.env.SOURCE_CACHE_DIR ?? ".cache/duosmium"),
    token: process.env.GITHUB_TOKEN || undefined,
    retry: {
      timeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 30_000),
      retries: Number(process.env.FETCH_RETRIES ?? 4),
      baseDelayMs: Number(process.env.FETCH_BACKOFF_MS ?? 1000),
      log,
    },
    log,
  });
}
