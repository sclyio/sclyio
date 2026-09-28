import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { databasePath, openDb } from "../src/lib/db/client";
import { log } from "./cli";

const file = databasePath();
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = openDb(file);
migrate(db, { migrationsFolder: path.resolve("drizzle") });
log(`migrated ${file}`);
db.$client.close();
