/**
 * SYNTHETIC fixtures for the account / claim / personal-rating tests. All
 * schools and people are fictional. Identities are created through the same
 * completeLogin() + createSession() path the Google callback uses after
 * openid-client has validated the ID token — a test-only adapter that never
 * exists as an HTTP route.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import type { Ctx } from "../src/lib/accounts/actor";
import { libsqlSource, migrateAccounts, run, sha256 } from "../src/lib/accounts/db";
import { csrfToken, completeLogin, createSession } from "../src/lib/auth/session";
import { rebuildRatings } from "../src/lib/rating/engine";
import { importAll, sciolyff, SyntheticSource, tempDb, type SynthPlacing } from "./helpers";

process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef-0123456789";

export const EVENTS_C = ["Anatomy and Physiology", "Codebusters", "Fermi Questions"];
export const EVENTS_B = ["Anatomy and Physiology", "Codebusters"];
export const TRIAL = "Robot Tour Trial";

const C_TEAMS = [
  { number: 1, school: "Alder Ridge High School", suffix: "Gold" },
  { number: 2, school: "Alder Ridge High School", suffix: "Silver" },
  { number: 3, school: "Birch Hollow High School" },
  { number: 4, school: "Cedar Point Academy" },
  { number: 5, school: "Dogwood Middle College" },
  { number: 6, school: "Elm Street Science School" },
];

function placings(orders: Record<string, number[]>): SynthPlacing[] {
  const out: SynthPlacing[] = [];
  for (const [event, order] of Object.entries(orders)) order.forEach((team, i) => out.push({ team, event, place: i + 1 }));
  return out;
}

function tourneyC(date: string, name: string, orders: Record<string, number[]>) {
  return sciolyff({
    name,
    division: "C",
    year: 2026,
    date,
    events: [...EVENTS_C.map((n) => ({ name: n })), { name: TRIAL, trial: true }],
    teams: C_TEAMS,
    placings: placings(orders),
  });
}

export interface World {
  dataPath: string;
  data: ReturnType<typeof libsqlSource>;
  dataClient: Client;
  db: Client;
  t: { a: string; b: string; c: string; divB: string };
}

/** Synthetic dataset (imported + rated by the real jobs) and an empty accounts DB. */
export async function world(): Promise<World> {
  const src = new SyntheticSource({ 2026: EVENTS_B }, { 2026: EVENTS_C });
  const t = {
    a: "2026-01-10_alpha_invitational_c",
    b: "2026-01-24_beta_invitational_c",
    c: "2026-02-07_gamma_invitational_c",
    divB: "2026-01-17_delta_invitational_b",
  };
  src.write(
    t.a,
    tourneyC("2026-01-10", "Alpha Invitational", {
      "Anatomy and Physiology": [1, 3, 2, 4, 5, 6],
      Codebusters: [3, 1, 4, 2, 6, 5],
      "Fermi Questions": [2, 1, 3, 5, 4, 6],
      [TRIAL]: [1, 2, 3, 4, 5, 6],
    }),
  );
  src.write(
    t.b,
    tourneyC("2026-01-24", "Beta Invitational", {
      "Anatomy and Physiology": [3, 1, 4, 2, 5, 6],
      Codebusters: [1, 3, 2, 5, 4, 6],
      "Fermi Questions": [4, 2, 1, 3, 6, 5],
      [TRIAL]: [6, 5, 4, 3, 2, 1],
    }),
  );
  src.write(
    t.c,
    tourneyC("2026-02-07", "Gamma Invitational", {
      "Anatomy and Physiology": [1, 4, 3, 2, 6, 5],
      Codebusters: [2, 1, 3, 4, 5, 6],
      "Fermi Questions": [1, 3, 2, 4, 5, 6],
      [TRIAL]: [1, 2, 3, 4, 5, 6],
    }),
  );
  src.write(
    t.divB,
    sciolyff({
      name: "Delta Invitational",
      division: "B",
      year: 2026,
      date: "2026-01-17",
      events: EVENTS_B.map((n) => ({ name: n })),
      teams: [
        { number: 1, school: "Alder Ridge High School" },
        { number: 2, school: "Birch Hollow High School" },
        { number: 3, school: "Cedar Point Academy" },
        { number: 4, school: "Dogwood Middle College" },
      ],
      placings: placings({ "Anatomy and Physiology": [1, 2, 3, 4], Codebusters: [2, 1, 4, 3] }),
    }),
  );
  const ds = tempDb();
  await importAll(ds, src);
  rebuildRatings({ db: ds, log: () => {} });
  const dataPath = ds.$client.name;
  ds.$client.close();
  const dataClient = createClient({ url: `file:${dataPath}`, intMode: "number" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sclyio-acct-"));
  const db = createClient({ url: `file:${path.join(dir, "accounts.db")}`, intMode: "number" });
  await migrateAccounts(db);
  return { dataPath, data: libsqlSource(dataClient), dataClient, db, t };
}

export interface TestIdentity {
  userId: string;
  sessionId: string;
  token: string;
  ctx: (now?: Date) => Ctx;
}

/** Sign a synthetic Google identity in through the real login/session code. */
export async function signIn(w: World, subject: string, email: string, now = new Date()): Promise<TestIdentity> {
  const r = await completeLogin(w.db, { subject, email, emailVerified: true }, now);
  const s = await createSession(w.db, r.userId, r.oauthAccountId, now);
  const sessionId = sha256(s.token);
  return {
    userId: r.userId,
    sessionId,
    token: s.token,
    ctx: (at = new Date()) => ({ db: w.db, data: w.data, now: at, sessionToken: s.token, csrf: csrfToken(sessionId) }),
  };
}

export const anon = (w: World): Ctx => ({ db: w.db, data: w.data, now: new Date(), sessionToken: null, csrf: null });

export async function tableChecksum(c: Client, table: string) {
  const rs = await c.execute(`SELECT * FROM ${table} ORDER BY 1, 2, 3`);
  return sha256(JSON.stringify(rs.rows));
}

export { run };
