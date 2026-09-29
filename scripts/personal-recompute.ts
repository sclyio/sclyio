import path from "node:path";
import { createClient } from "@libsql/client";
import { accountsDb, libsqlSource, rows } from "../src/lib/accounts/db";
import { recomputePersonal } from "../src/lib/personal/snapshots";
import { args, log } from "./cli";

/**
 * Recompute every stored Unofficial USR against a dataset, e.g. right after
 * publishing a new build. (Pages also recompute lazily when a stored score's
 * inputs or dataset build no longer match, so this is optional.)
 *
 *   npm run personal:recompute -- [--data libsql://…|file:…] [--token …]
 */
const a = args();
const url = (a.data as string) || process.env.DATABASE_URL || `file:${path.resolve(process.env.DATABASE_PATH ?? "./data/sclyio.db")}`;
const token = (a.token as string) || process.env.DATABASE_AUTH_TOKEN || undefined;
const data = libsqlSource(createClient({ url, authToken: token, intMode: "number" }));
const db = accountsDb();
const pools = await rows<{ user_id: string; division: string; season: number }>(
  db,
  `SELECT DISTINCT user_id, division, season FROM participation_claims`,
);
for (const p of pools) await recomputePersonal(db, data, p.user_id, p.division, p.season, new Date());
log(`recomputed ${pools.length} personal rating pool(s)`);
