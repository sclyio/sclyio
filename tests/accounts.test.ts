import { beforeAll, describe, expect, it } from "vitest";
import { requireAdmin, requireUser, type Ctx } from "../src/lib/accounts/actor";
import { addClaims, editClaim, joinSchool, requestVerification, setDisplayName, setProfilePrivacy, withdrawClaim } from "../src/lib/accounts/claims";
import { publicProfile, schoolMembers } from "../src/lib/accounts/public";
import { dashboard } from "../src/lib/accounts/dashboard";
import { ensureAccountsSchema, REQUIRED_ACCOUNTS_MIGRATION, row, rows, run } from "../src/lib/accounts/db";
import { AccessError, ConflictError, ValidationError } from "../src/lib/accounts/errors";
import { adminQueue, decideClaim, decideMembership, decideSubmission } from "../src/lib/accounts/review";
import { ADMIN_EMAIL, isAdminIdentity, normalizeEmail } from "../src/lib/auth/policy";
import { safeReturnTo } from "../src/lib/auth/return-to";
import { completeLogin, createSession, LoginError, revokeSession } from "../src/lib/auth/session";
import { personalRating, recomputePersonal } from "../src/lib/personal/snapshots";
import { aggregatePersonal, personalEventSkill } from "../src/lib/personal/rating";
import { toUsr } from "../src/lib/rating/math";
import { anon, EVENTS_C, signIn, tableChecksum, TRIAL, world, type TestIdentity, type World } from "./accounts-helpers";

/* SYNTHETIC fixtures only: fictional schools and people. */

let w: World;
let ids: {
  alder: string;
  birch: string;
  entry: (t: string, n: number) => string;
  ev: (t: string, name: string) => Promise<string>;
};

beforeAll(async () => {
  w = await world();
  const school = async (name: string) => (await w.data.get<{ id: string }>(`SELECT id FROM schools WHERE name = ?`, [name]))!.id;
  ids = {
    alder: await school("Alder Ridge High School"),
    birch: await school("Birch Hollow High School"),
    entry: (t, n) => `${t}#${n}`,
    ev: async (t, name) => (await w.data.get<{ id: string }>(`SELECT id FROM tournament_events WHERE tournament_id = ? AND name = ?`, [t, name]))!.id,
  };
}, 120_000);

async function student(sub: string, name = `Student ${sub}`, school = ids.alder): Promise<TestIdentity & { membershipId: string }> {
  const me = await signIn(w, sub, `${sub}@example.test`);
  await setDisplayName(me.ctx(), name);
  const membershipId = await joinSchool(me.ctx(), { schoolId: school, division: "C", season: 2026 });
  return { ...me, membershipId };
}

async function admin(now = new Date()) {
  return signIn(w, "google-admin-sub", ADMIN_EMAIL, now);
}

const rejects = async (p: Promise<unknown>, cls: new (...a: never[]) => Error, code?: string) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(cls);
  if (code) expect((e as AccessError).code).toBe(code);
};

/* ------------------------------------------------------------------ */

describe("accounts schema", () => {
  it("the code's required migration is the newest file, and a fresh database passes the check", async () => {
    const fs = await import("node:fs");
    const files = fs.readdirSync("accounts/migrations").filter((f: string) => f.endsWith(".sql")).sort();
    expect(REQUIRED_ACCOUNTS_MIGRATION).toBe(files[files.length - 1]);
    await ensureAccountsSchema(w.db);
  });
});

describe("administrator policy", () => {
  it("accepts only the exact verified Google email", () => {
    const ok = { provider: "google", providerEmail: ADMIN_EMAIL, emailVerified: true };
    expect(isAdminIdentity(ok)).toBe(true);
    expect(isAdminIdentity({ ...ok, providerEmail: `  ${ADMIN_EMAIL.toUpperCase()} ` })).toBe(true); // lowercase + trim only
    for (const email of [
      "universalscioly.rating@gmail.com", // dots are not stripped
      "universal.sciolyrating@gmail.com",
      "universal.scioly.rating+admin@gmail.com", // plus suffix is not removed
      "universal.scioly.rating@googlemail.com",
      "universal.scioly.rating@gmail.com.evil.test",
      "xuniversal.scioly.rating@gmail.com",
    ]) {
      expect(isAdminIdentity({ ...ok, providerEmail: email }), email).toBe(false);
    }
    expect(isAdminIdentity({ ...ok, emailVerified: false })).toBe(false);
    expect(isAdminIdentity({ ...ok, provider: "github" })).toBe(false);
    expect(isAdminIdentity(null)).toBe(false);
    expect(normalizeEmail(" A@B.com ")).toBe("a@b.com");
  });

  it("returns only same-origin allowlisted paths after login", () => {
    expect(safeReturnTo("/admin/verifications?state=open")).toBe("/admin/verifications?state=open");
    expect(safeReturnTo("/dashboard/claims/new")).toBe("/dashboard/claims/new");
    for (const bad of ["https://evil.test/dashboard", "//evil.test/dashboard", "/\\evil.test", "/rankings", "javascript:alert(1)", "/dashboard\n", null]) {
      expect(safeReturnTo(bad)).toBe("/dashboard");
    }
  });
});

describe("Google sign-in and sessions", () => {
  it("keys accounts by provider subject, idempotently, and never links by email", async () => {
    const now = new Date();
    const a = await completeLogin(w.db, { subject: "sub-idem", email: "same@example.test", emailVerified: true }, now);
    const b = await completeLogin(w.db, { subject: "sub-idem", email: "renamed@example.test", emailVerified: true }, now);
    expect(b.userId).toBe(a.userId);
    expect(b.isNew).toBe(false);
    const other = await completeLogin(w.db, { subject: "sub-other", email: "renamed@example.test", emailVerified: true }, now);
    expect(other.userId).not.toBe(a.userId); // matching email does not link
    await rejects(completeLogin(w.db, { subject: "sub-unverified", email: "u@example.test", emailVerified: false }, now), LoginError);
  });

  it("the first account to register gets no admin rights", async () => {
    const first = await signIn(w, "sub-first-ever", "first@example.test");
    await rejects(requireAdmin(first.ctx()), AccessError, "forbidden");
  });

  it("rejects anonymous, expired, and logged-out sessions", async () => {
    await rejects(requireUser(anon(w)), AccessError, "unauthenticated");
    const me = await signIn(w, "sub-expire", "e@example.test");
    const later = new Date(Date.now() + 15 * 24 * 3600 * 1000);
    await rejects(requireUser(me.ctx(later)), AccessError, "unauthenticated");
    await requireUser(me.ctx());
    await revokeSession(w.db, me.token, new Date());
    await rejects(requireUser(me.ctx()), AccessError, "unauthenticated");
    await rejects(requireUser({ ...anon(w), sessionToken: "x".repeat(43) }), AccessError, "unauthenticated");
  });
});

describe("admin authorization boundary", () => {
  it("passes only the configured verified Google identity with a fresh sign-in", async () => {
    const a = await admin();
    const actor = await requireAdmin(a.ctx(), { mutation: true });
    expect(actor.isAdmin).toBe(true);
    // Viewing is allowed on an older session; review mutations need a sign-in within 30 minutes.
    await requireAdmin(a.ctx(new Date(Date.now() + 31 * 60 * 1000)));
    await rejects(requireAdmin(a.ctx(new Date(Date.now() + 31 * 60 * 1000)), { mutation: true }), AccessError, "reauth_required");
    await rejects(requireAdmin({ ...a.ctx(), csrf: null }, { mutation: true }), AccessError, "csrf");
    await rejects(requireAdmin({ ...a.ctx(), csrf: "forged" }, { mutation: true }), AccessError, "csrf");
  });

  it("forged role/email fields and similar addresses do not grant admin", async () => {
    const me = await signIn(w, "sub-forger", "universal.scioly.rating+x@gmail.com");
    const forged = { ...me.ctx(), isAdmin: true, email: ADMIN_EMAIL, role: "admin", providerEmail: ADMIN_EMAIL } as Ctx;
    await rejects(requireAdmin(forged), AccessError, "forbidden");
    // A display name is never an authority either.
    await rejects(setDisplayName(me.ctx(), ADMIN_EMAIL), ValidationError);
    for (const [sub, email] of [
      ["sub-dots", "universalscioly.rating@gmail.com"],
      ["sub-gm", "universal.scioly.rating@googlemail.com"],
    ]) {
      const x = await signIn(w, sub, email);
      await rejects(requireAdmin(x.ctx()), AccessError, "forbidden");
    }
  });

  it("rejects the admin email when unverified or from another provider", async () => {
    const now = new Date().toISOString();
    for (const [uid, oa, provider, verified] of [
      ["usr_unver", "oa_unver", "google", 0],
      ["usr_gh", "oa_gh", "github", 1],
    ] as const) {
      await run(w.db, `INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)`, [uid, now, now]);
      await run(
        w.db,
        `INSERT INTO oauth_accounts (id, user_id, provider, subject, provider_email, email_verified, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [oa, uid, provider, `s-${uid}`, ADMIN_EMAIL, verified, now, now],
      );
      const s = await createSession(w.db, uid, oa, new Date());
      await rejects(requireAdmin({ ...anon(w), sessionToken: s.token }), AccessError, "forbidden");
    }
  });

  it("normal users and anonymous visitors cannot call admin actions or read the queue", async () => {
    const s = await student("sub-normal");
    await rejects(adminQueue(s.ctx()), AccessError, "forbidden");
    await rejects(adminQueue(anon(w)), AccessError, "unauthenticated");
    await rejects(decideClaim(s.ctx(), { id: "x", revision: 1, decision: "VERIFIED" }), AccessError, "forbidden");
    await rejects(decideMembership(s.ctx(), { id: s.membershipId, revision: 1, decision: "VERIFIED" }), AccessError, "forbidden");
    await rejects(decideSubmission(anon(w), { claims: [] }), AccessError, "unauthenticated");
  });
});

describe("memberships and claims", () => {
  it("anonymous requests and CSRF-less forms cannot mutate", async () => {
    const s = await student("sub-csrf");
    const ev = await ids.ev(w.t.a, "Codebusters");
    await rejects(addClaims(anon(w), { membershipId: s.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 1), tournamentEventIds: [ev] }), AccessError, "unauthenticated");
    await rejects(
      addClaims({ ...s.ctx(), csrf: null }, { membershipId: s.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 1), tournamentEventIds: [ev] }),
      AccessError,
      "csrf",
    );
  });

  it("validates every reference on the server", async () => {
    const s = await student("sub-validate");
    const cb = await ids.ev(w.t.a, "Codebusters");
    const base = { membershipId: s.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 1), tournamentEventIds: [cb] };
    await rejects(addClaims(s.ctx(), { ...base, entryId: ids.entry(w.t.a, 3) }), ValidationError); // Birch's entry
    await rejects(addClaims(s.ctx(), { ...base, entryId: ids.entry(w.t.b, 1) }), ValidationError); // entry from another tournament
    await rejects(addClaims(s.ctx(), { ...base, entryId: "fabricated#1" }), ValidationError);
    await rejects(addClaims(s.ctx(), { ...base, tournamentEventIds: [`${w.t.a}:not-an-event`] }), ValidationError);
    await rejects(addClaims(s.ctx(), { ...base, tournamentEventIds: [await ids.ev(w.t.b, "Codebusters")] }), ValidationError);
    await rejects(addClaims(s.ctx(), { ...base, tournamentEventIds: [cb, cb] }), ValidationError);
    // Division mismatch: a Division B tournament under a Division C affiliation.
    await rejects(
      addClaims(s.ctx(), { ...base, tournamentId: w.t.divB, entryId: ids.entry(w.t.divB, 1), tournamentEventIds: [await ids.ev(w.t.divB, "Codebusters")] }),
      ValidationError,
    );
    await rejects(joinSchool(s.ctx(), { schoolId: "no-such-school", division: "C", season: 2026 }), ValidationError);
    await rejects(joinSchool(s.ctx(), { schoolId: ids.alder, division: "C", season: 1999 }), ValidationError);
    await rejects(joinSchool(s.ctx(), { schoolId: ids.birch, division: "C", season: 2026 }), ConflictError); // two schools at the same time
  });

  it("stores one claim per event, lets partners share a result, and blocks multi-team claims", async () => {
    const a = await student("sub-partner-a");
    const b = await student("sub-partner-b");
    const cb = await ids.ev(w.t.a, "Codebusters");
    const fermi = await ids.ev(w.t.a, "Fermi Questions");
    const made = await addClaims(a.ctx(), { membershipId: a.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 1), tournamentEventIds: [cb, fermi] });
    expect(made).toHaveLength(2);
    // Event partner claims the same team-event result.
    await addClaims(b.ctx(), { membershipId: b.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 1), tournamentEventIds: [cb] });
    // Same user, same event, other Alder team: refused.
    await rejects(
      addClaims(a.ctx(), { membershipId: a.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 2), tournamentEventIds: [cb] }),
      ConflictError,
    );
    await rejects(
      addClaims(a.ctx(), { membershipId: a.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 1), tournamentEventIds: [cb] }),
      ConflictError,
    );
    // Other users cannot touch these claims or memberships.
    await rejects(withdrawClaim(b.ctx(), { claimId: made[0] }), ValidationError);
    await rejects(editClaim(b.ctx(), { claimId: made[0], revision: 1, entryId: ids.entry(w.t.a, 2), tournamentEventId: cb }), ValidationError);
    await rejects(requestVerification(b.ctx(), { membershipId: a.membershipId, includeMembership: true, claimIds: [], explanation: "" }), ValidationError);
    await rejects(requestVerification(b.ctx(), { membershipId: b.membershipId, includeMembership: false, claimIds: [made[0]], explanation: "" }), ValidationError);
    // Withdraw then re-add revives the same row with a new revision.
    await withdrawClaim(a.ctx(), { claimId: made[1] });
    const again = await addClaims(a.ctx(), { membershipId: a.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 2), tournamentEventIds: [fermi] });
    expect(again[0]).toBe(made[1]);
    const r = await row<{ revision: number; status: string; entry_id: string }>(w.db, `SELECT revision, status, entry_id FROM participation_claims WHERE id = ?`, [made[1]]);
    expect(r).toMatchObject({ revision: 2, status: "SELF_REPORTED", entry_id: ids.entry(w.t.a, 2) });
  });

  it("allows several seasons and schools over time, but only one school per season and no partial seasons", async () => {
    const me = await signIn(w, "sub-multi", "multi@example.test");
    await setDisplayName(me.ctx(), "Multi School");
    await joinSchool(me.ctx(), { schoolId: ids.alder, division: "C", season: 2026 });
    // Earlier season at a different school is fine.
    await joinSchool(me.ctx(), { schoolId: ids.birch, division: "C", season: 2025 });
    // Same school, other division, same season: still one school.
    await joinSchool(me.ctx(), { schoolId: ids.alder, division: "B", season: 2026 });
    // A different school in a season already taken, in either division, is refused.
    await rejects(joinSchool(me.ctx(), { schoolId: ids.birch, division: "B", season: 2026 }), ConflictError);
    await rejects(joinSchool(me.ctx(), { schoolId: ids.alder, division: "C", season: 2025 }), ConflictError);
    // Partial-season fields are not accepted: whatever is sent, the affiliation covers the whole season.
    const cols = await rows<{ starts_on: string | null; ends_on: string | null }>(w.db, `SELECT starts_on, ends_on FROM school_memberships WHERE user_id = ?`, [me.userId]);
    expect(cols.every((c) => c.starts_on === null && c.ends_on === null)).toBe(true);
    await rejects(
      joinSchool(me.ctx(), { schoolId: ids.birch, division: "B", season: 2026, startsOn: "2026-01-20" } as Parameters<typeof joinSchool>[1]),
      ConflictError,
    );
  });

  it("public profiles and school member lists respect privacy and hide rejected affiliations", async () => {
    const pub = await student("sub-public", "Public Pat");
    const priv = await student("sub-private", "Private Pia");
    await setProfilePrivacy(priv.ctx(), true);
    await rejects(setProfilePrivacy({ ...pub.ctx(), csrf: null }, true), AccessError, "csrf");
    await requestVerification(pub.ctx(), { membershipId: pub.membershipId, includeMembership: true, claimIds: [], explanation: "" });
    const a = await admin();
    await decideMembership(a.ctx(), { id: pub.membershipId, revision: 1, decision: "VERIFIED", privateNote: "secret-admin-note" });
    const rej = await student("sub-rejected", "Rejected Rae");
    await requestVerification(rej.ctx(), { membershipId: rej.membershipId, includeMembership: true, claimIds: [], explanation: "" });
    await decideMembership(a.ctx(), { id: rej.membershipId, revision: 1, decision: "REJECTED", publicReason: "Not on roster." });

    const list = await schoolMembers(w.db, ids.alder);
    const names = list.members.map((m) => m.displayName);
    expect(names).toContain("Public Pat");
    expect(names).not.toContain("Private Pia");
    expect(names).not.toContain("Rejected Rae");
    expect(list.members.find((m) => m.displayName === "Public Pat")!.verified).toBe(true);
    expect(list.members.filter((m) => m.displayName !== "Public Pat").every((m) => !m.verified)).toBe(true);
    expect(list.privateCount).toBeGreaterThanOrEqual(1);

    const now = new Date();
    const seen = await publicProfile(w.db, w.data, pub.userId, null, now);
    expect(seen?.displayName).toBe("Public Pat");
    const json = JSON.stringify(seen);
    for (const secret of ["@example.test", "sub-public", "secret-admin-note", pub.token]) expect(json).not.toContain(secret);
    expect(await publicProfile(w.db, w.data, priv.userId, null, now)).toBeNull();
    expect(await publicProfile(w.db, w.data, priv.userId, pub.userId, now)).toBeNull();
    expect((await publicProfile(w.db, w.data, priv.userId, priv.userId, now))?.isPrivate).toBe(true); // owner preview
    expect(await publicProfile(w.db, w.data, "usr_does_not_exist", null, now)).toBeNull();
    await setProfilePrivacy(priv.ctx(), false);
    expect((await schoolMembers(w.db, ids.alder)).members.map((m) => m.displayName)).toContain("Private Pia");
  });
});

describe("manual verification", () => {
  it("runs request → verify, resets on edit, and refuses stale revisions", async () => {
    const s = await student("sub-review");
    const cb = await ids.ev(w.t.b, "Codebusters");
    const ap = await ids.ev(w.t.b, "Anatomy and Physiology");
    const [c1, c2] = await addClaims(s.ctx(), { membershipId: s.membershipId, tournamentId: w.t.b, entryId: ids.entry(w.t.b, 1), tournamentEventIds: [cb, ap] });
    await requestVerification(s.ctx(), { membershipId: s.membershipId, includeMembership: true, claimIds: [c1, c2], explanation: "I was captain." });
    const a = await admin();
    const queue = await adminQueue(a.ctx());
    const item = queue.find((q) => q.user.id === s.userId)!;
    expect(item.claims.map((c) => c.claim.status)).toEqual(["PENDING", "PENDING"]);
    expect(item.request.explanation).toBe("I was captain.");

    // Per-claim decisions in one submission; rejection needs a user-visible reason.
    const res = await decideSubmission(a.ctx(), {
      membership: { id: s.membershipId, revision: 1, decision: "VERIFIED", privateNote: "roster photo" },
      claims: [
        { id: c1, revision: 1, decision: "VERIFIED" },
        { id: c2, revision: 1, decision: "REJECTED" },
      ],
    });
    expect(res.map((r) => r.ok)).toEqual([true, true, false]);
    await decideClaim(a.ctx(), { id: c2, revision: 1, decision: "REJECTED", publicReason: "Not on the event roster.", privateNote: "coach said no" });

    // Editing a verified claim resets it and bumps the revision.
    await editClaim(s.ctx(), { claimId: c1, revision: 1, entryId: ids.entry(w.t.b, 2), tournamentEventId: cb });
    const after = await row<{ status: string; revision: number }>(w.db, `SELECT status, revision FROM participation_claims WHERE id = ?`, [c1]);
    expect(after).toMatchObject({ status: "SELF_REPORTED", revision: 2 });
    // Approving the old revision fails safely.
    await requestVerification(s.ctx(), { membershipId: s.membershipId, includeMembership: false, claimIds: [c1], explanation: "" });
    await rejects(decideClaim(a.ctx(), { id: c1, revision: 1, decision: "VERIFIED" }), ConflictError);
    await decideClaim(a.ctx(), { id: c1, revision: 2, decision: "VERIFIED" });
    // Invalid transitions are refused.
    await rejects(decideClaim(a.ctx(), { id: c1, revision: 2, decision: "VERIFIED" }), ConflictError);
    await rejects(decideClaim(a.ctx(), { id: c2, revision: 1, decision: "REVOKED", publicReason: "x" }), ConflictError);
    // Revocation with reason.
    await decideClaim(a.ctx(), { id: c1, revision: 2, decision: "REVOKED", publicReason: "Roster correction." });

    // Decisions are bound to revisions and append-only.
    const decisions = await rows<{ subject_revision: number; decision: string }>(
      w.db,
      `SELECT subject_revision, decision FROM verification_decisions WHERE subject_id = ? ORDER BY created_at, rowid`,
      [c1],
    );
    expect(decisions).toEqual([
      { subject_revision: 1, decision: "VERIFIED" },
      { subject_revision: 2, decision: "VERIFIED" },
      { subject_revision: 2, decision: "REVOKED" },
    ]);
    await expect(run(w.db, `UPDATE verification_decisions SET decision = 'VERIFIED'`)).rejects.toThrow(/append-only/);
    await expect(run(w.db, `DELETE FROM audit_log`)).rejects.toThrow(/append-only/);

    // The user sees public reasons, never private notes or identity fields.
    const dash = await dashboard(s.ctx());
    const json = JSON.stringify(dash);
    expect(json).toContain("Not on the event roster.");
    expect(json).not.toContain("coach said no");
    expect(json).not.toContain("roster photo");
    expect(json).not.toContain("@example.test");
    expect(json).not.toContain("sub-review");
    expect(json).not.toContain(s.token);
  });

  it("the admin cannot review their own affiliation or claims", async () => {
    const a = await admin();
    await setDisplayName(a.ctx(), "Site Admin");
    const m = await joinSchool(a.ctx(), { schoolId: ids.birch, division: "C", season: 2026 });
    const [c] = await addClaims(a.ctx(), { membershipId: m, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 3), tournamentEventIds: [await ids.ev(w.t.a, "Codebusters")] });
    await requestVerification(a.ctx(), { membershipId: m, includeMembership: true, claimIds: [c], explanation: "" });
    await rejects(decideClaim(a.ctx(), { id: c, revision: 1, decision: "VERIFIED" }), AccessError, "forbidden");
    await rejects(decideMembership(a.ctx(), { id: m, revision: 1, decision: "VERIFIED" }), AccessError, "forbidden");
  });
});

describe("unofficial personal USR", () => {
  it("s_e = Σwa / (Σw + 2); summary = mean of rated events; no events → no score", () => {
    expect(personalEventSkill([{ a: 1, w: 1 }])).toBeCloseTo(1 / 3, 12);
    expect(personalEventSkill([{ a: 2, w: 1 }, { a: 0, w: 3 }])).toBeCloseTo(2 / 6, 12);
    const none = aggregatePersonal([]);
    expect(none).toMatchObject({ state: "no_eligible", summaryUsr: null, summaryZ: null });
    const local = aggregatePersonal([
      { claimId: "c", status: "PENDING", verified: false, tournamentId: "t", season: 2026, eventDefId: "e", eventName: "E", outcome: "counted", reason: null, a: 1, w: 1, comparable: false },
    ]);
    expect(local.state).toBe("insufficient_comparable"); // local estimates are not averaged into a summary
    expect(local.summaryUsr).toBeNull();
    expect(local.events[0].comparable).toBe(false);
  });

  it("uses only claimed eligible events, reproduces the engine's x + k, and never changes team ratings", async () => {
    const before = await Promise.all(["overall_ratings", "event_ratings", "field_fits", "observations", "event_results"].map((t) => tableChecksum(w.dataClient, t)));
    const s = await student("sub-rating");
    const cbA = await ids.ev(w.t.a, "Codebusters");
    const cbC = await ids.ev(w.t.c, "Codebusters");
    const trial = await ids.ev(w.t.a, TRIAL);
    await addClaims(s.ctx(), { membershipId: s.membershipId, tournamentId: w.t.a, entryId: ids.entry(w.t.a, 2), tournamentEventIds: [cbA, trial] });
    const [cC] = await addClaims(s.ctx(), { membershipId: s.membershipId, tournamentId: w.t.c, entryId: ids.entry(w.t.c, 2), tournamentEventIds: [cbC] });

    const view = await personalRating(w.db, w.data, s.userId, "C", 2026, new Date());
    expect(view.pending).toBe(false);
    const snap = view.snapshot!;
    expect(snap.state).toBe("rated");
    expect(snap.events.map((e) => e.name)).toEqual(["Codebusters"]); // only the claimed, rated event
    expect(snap.ratedEvents).toBe(1);
    expect(snap.competitions).toBe(2);
    expect(snap.contributingClaims).toBe(2);
    expect(snap.verifiedContributingClaims).toBe(0);
    expect(snap.provisional).toBe(true); // fewer than 3 contributing claims
    const trialClaim = snap.claims.find((c) => c.eventName === TRIAL)!;
    expect(trialClaim.outcome).toBe("no_eligible_result");
    expect(trialClaim.a).toBeUndefined();

    // Recompute by hand from the rating job's own stored observations and field fits.
    const buildId = Number((await w.data.get<{ value: string }>(`SELECT value FROM kv WHERE key = 'published_build_id'`))!.value);
    const sn = (await w.data.get<{ id: number }>(
      `SELECT id FROM snapshots WHERE build_id = ? AND division = 'C' AND view = 'team' AND season = 2026 AND has_event_detail = 1 ORDER BY as_of DESC LIMIT 1`,
      [buildId],
    ))!;
    let num = 0;
    let den = 2;
    for (const [t, tev] of [
      [w.t.a, cbA],
      [w.t.c, cbC],
    ]) {
      const o = (await w.data.get<{ x: number }>(`SELECT x FROM observations WHERE view = 'team' AND tournament_event_id = ? AND source_entry_id = ?`, [tev, ids.entry(t, 2)]))!;
      const f = (await w.data.get<{ k: number; weight: number; n: number }>(`SELECT k, weight, n FROM field_fits WHERE snapshot_id = ? AND tournament_event_id = ?`, [sn.id, tev]))!;
      const wt = f.weight / f.n;
      num += wt * (o.x + f.k);
      den += wt;
      const ev = snap.claims.find((c) => c.tournamentId === t && c.eventName === "Codebusters")!;
      expect(ev.x).toBeCloseTo(o.x, 12);
      expect(ev.k).toBeCloseTo(f.k, 12);
    }
    expect(snap.summaryZ).toBeCloseTo(num / den, 12);
    expect(snap.summaryUsr).toBeCloseTo(toUsr(num / den), 12);
    expect(snap.summaryUsr).not.toBe(0);

    // A rejected claim stops counting; the stored snapshot is recomputed, not left stale.
    await requestVerification(s.ctx(), { membershipId: s.membershipId, includeMembership: false, claimIds: [cC], explanation: "" });
    const a = await admin();
    await decideClaim(a.ctx(), { id: cC, revision: 1, decision: "REJECTED", publicReason: "No record." });
    const v2 = (await personalRating(w.db, w.data, s.userId, "C", 2026, new Date())).snapshot!;
    expect(v2.competitions).toBe(1);
    expect(v2.contributingClaims).toBe(1);
    expect(v2.claims.find((c) => c.claimId === cC)!.outcome).toBe("not_counted");

    // Personal claims never touched the results or team/school ratings.
    const after = await Promise.all(["overall_ratings", "event_ratings", "field_fits", "observations", "event_results"].map((t) => tableChecksum(w.dataClient, t)));
    expect(after).toEqual(before);
  });

  it("counts verified contributing claims and flags verified evidence after a source correction", async () => {
    const s = await student("sub-source");
    const fermi = await ids.ev(w.t.b, "Fermi Questions");
    const [c] = await addClaims(s.ctx(), { membershipId: s.membershipId, tournamentId: w.t.b, entryId: ids.entry(w.t.b, 2), tournamentEventIds: [fermi] });
    await requestVerification(s.ctx(), { membershipId: s.membershipId, includeMembership: false, claimIds: [c], explanation: "" });
    const a = await admin();
    await decideClaim(a.ctx(), { id: c, revision: 1, decision: "VERIFIED" });
    const v = (await personalRating(w.db, w.data, s.userId, "C", 2026, new Date())).snapshot!;
    expect(v.verifiedContributingClaims).toBe(1);
    expect(v.contributingClaims).toBe(1);

    // Simulate a corrected source publish: the claimed result changes.
    await w.dataClient.execute({ sql: `UPDATE event_results SET place = 6 WHERE entry_id = ? AND tournament_event_id = ?`, args: [ids.entry(w.t.b, 2), fermi] });
    try {
      await recomputePersonal(w.db, w.data, s.userId, "C", 2026, new Date());
      const claim = await row<{ status: string; source_state: string }>(w.db, `SELECT status, source_state FROM participation_claims WHERE id = ?`, [c]);
      expect(claim).toMatchObject({ status: "VERIFIED", source_state: "changed" });
      const v2 = (await personalRating(w.db, w.data, s.userId, "C", 2026, new Date())).snapshot!;
      expect(v2.verifiedContributingClaims).toBe(0); // no longer counted as admin-verified evidence
      const q = await adminQueue(a.ctx(), { state: "all" });
      expect(q.flatMap((i) => i.claims).find((x) => x.claim.id === c)!.flags).toContain("official result changed since it was verified");
    } finally {
      await w.dataClient.execute({ sql: `UPDATE event_results SET place = 2 WHERE entry_id = ? AND tournament_event_id = ?`, args: [ids.entry(w.t.b, 2), fermi] });
    }
  });

  it("USR counts earlier seasons' equivalent events; Season Trend counts only the rated season", async () => {
    const me = await signIn(w, "sub-trend", "trend@example.test");
    await setDisplayName(me.ctx(), "Trend Tester");
    const m25 = await joinSchool(me.ctx(), { schoolId: ids.alder, division: "C", season: 2025 });
    const m26 = await joinSchool(me.ctx(), { schoolId: ids.alder, division: "C", season: 2026 });
    await addClaims(me.ctx(), { membershipId: m25, tournamentId: w.t.prev, entryId: ids.entry(w.t.prev, 1), tournamentEventIds: [await ids.ev(w.t.prev, "Codebusters"), await ids.ev(w.t.prev, "Fermi Questions")] });
    await addClaims(me.ctx(), { membershipId: m26, tournamentId: w.t.b, entryId: ids.entry(w.t.b, 1), tournamentEventIds: [await ids.ev(w.t.b, "Codebusters")] });
    const s26 = (await personalRating(w.db, w.data, me.userId, "C", 2026, new Date())).snapshot!;
    const prevCb = s26.claims.find((c) => c.season === 2025 && c.eventName === "Codebusters")!;
    const prevFermi = s26.claims.find((c) => c.season === 2025 && c.outcome !== "counted")!;
    expect(prevCb.outcome).toBe("counted"); // equivalent event, carried with its season weight
    expect(prevCb.eventDefId).toBe("C-2026-codebusters");
    expect(prevFermi.reason).toMatch(/no equivalent official event/); // not mapped across seasons
    expect(s26.events.find((e) => e.name === "Codebusters")!.claims).toBe(2);
    expect(s26.trendState).toBe("rated");
    expect(s26.summaryUsr).not.toBeCloseTo(s26.trendUsr!, 6); // USR uses both seasons, the trend only 2026
    // The trend equals the method applied to the 2026 claim alone.
    const only26 = aggregatePersonal(s26.claims.filter((c) => c.season === 2026));
    expect(s26.trendZ).toBeCloseTo(only26.summaryZ!, 12);
    // The 2025 rating stands on its own season's refit.
    const s25 = (await personalRating(w.db, w.data, me.userId, "C", 2025, new Date())).snapshot!;
    expect(s25.state).toBe("rated");
    expect(s25.summaryZ).toBeCloseTo(s25.trendZ!, 12);
  });

  it("claims in events without a model estimate or on unclaimed events add nothing", async () => {
    const s = await student("sub-none");
    const view = await personalRating(w.db, w.data, s.userId, "C", 2026, new Date());
    expect(view.snapshot!.state).toBe("no_eligible");
    expect(view.snapshot!.summaryUsr).toBeNull();
    expect(EVENTS_C.length).toBe(3);
  });
});
