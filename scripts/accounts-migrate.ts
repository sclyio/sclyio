import fs from "node:fs";
import path from "node:path";
import { accountsDb, accountsDbUrl, migrateAccounts } from "../src/lib/accounts/db";
import { log } from "./cli";

/** Create/upgrade the accounts database (additive migrations only; never touches result datasets). */
const { url } = accountsDbUrl();
if (url.startsWith("file:")) fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
const applied = await migrateAccounts(accountsDb());
log(applied.length ? `accounts: applied ${applied.join(", ")}` : "accounts: up to date");
