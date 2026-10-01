"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, type Ctx } from "@/lib/accounts/actor";
import { addClaims, editClaim, joinSchoolSeasons, requestVerification, setDisplayName, setProfilePrivacy, withdrawClaim } from "@/lib/accounts/claims";
import { AccessError, ConflictError, isDomainError } from "@/lib/accounts/errors";
import { decideSubmission, type DecisionInput } from "@/lib/accounts/review";
import { requestCtx, SESSION_COOKIE, secureCookies } from "@/lib/accounts/server";
import { safeReturnTo } from "@/lib/auth/return-to";
import { revokeAllSessions, revokeSession } from "@/lib/auth/session";

/**
 * Server actions. Each one builds its context from the session cookie and
 * the form's CSRF token and calls a domain function that does its own
 * authorization; nothing here trusts hidden fields for identity or role.
 * (Next.js also rejects cross-origin action POSTs by Origin/Host.)
 */

function withParam(path: string, key: string, value: string) {
  const u = new URL(path, "http://x.invalid");
  u.searchParams.delete("msg");
  u.searchParams.delete("error");
  u.searchParams.set(key, value);
  return `${u.pathname}${u.search}`;
}

type Done = { to?: string; msg?: string } | void;

async function act(fd: FormData, fallback: string, fn: (ctx: Ctx) => Promise<Done>, success = "Saved.") {
  const back = safeReturnTo(fd.get("back"), fallback);
  const ctx = await requestCtx(fd);
  let dest: string;
  try {
    const r = (await fn(ctx)) || {};
    dest = withParam(r.to ?? back, "msg", r.msg ?? success);
  } catch (e) {
    if (e instanceof AccessError && e.code === "unauthenticated") dest = `/login?returnTo=${encodeURIComponent(back)}`;
    else if (e instanceof AccessError && e.code === "reauth_required") dest = `/auth/google/start?reauth=1&returnTo=${encodeURIComponent(back)}`;
    else if (isDomainError(e)) dest = withParam(back, "error", e.message);
    else throw e;
  }
  redirect(dest);
}

async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE(), "", { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", maxAge: 0 });
}

export async function logoutAction(fd: FormData) {
  const ctx = await requestCtx(fd);
  try {
    await requireUser(ctx, { mutation: true });
    await revokeSession(ctx.db, ctx.sessionToken, ctx.now);
  } catch (e) {
    if (!(e instanceof AccessError && e.code === "unauthenticated")) throw e;
  }
  await clearSessionCookie();
  redirect("/");
}

export async function logoutEverywhereAction(fd: FormData) {
  const ctx = await requestCtx(fd);
  const actor = await requireUser(ctx, { mutation: true });
  await revokeAllSessions(ctx.db, actor.userId, ctx.now);
  await clearSessionCookie();
  redirect("/");
}

export async function saveDisplayNameAction(fd: FormData) {
  await act(fd, "/settings/profile", async (ctx) => {
    await setDisplayName(ctx, fd.get("displayName"));
  }, "Display name saved.");
}

export async function joinSchoolAction(fd: FormData) {
  await act(fd, "/dashboard", async (ctx) => {
    if (fd.get("displayName") !== null) await setDisplayName(ctx, fd.get("displayName"));
    // Each checked "ds" is "C:2026" (division:season); all are added together or none are.
    const ids = await joinSchoolSeasons(ctx, { schoolId: fd.get("school"), seasons: fd.getAll("ds") });
    return {
      to: "/dashboard",
      msg: `Added ${ids.length} season${ids.length === 1 ? "" : "s"}. Affiliations are unverified until an admin reviews them.`,
    };
  });
}

export async function privacyAction(fd: FormData) {
  const isPrivate = fd.get("private") === "1";
  await act(fd, "/settings/profile", async (ctx) => {
    await setProfilePrivacy(ctx, isPrivate);
  }, isPrivate ? "Your profile is now private." : "Your profile is now public.");
}

export async function addClaimsAction(fd: FormData) {
  await act(fd, "/dashboard/claims/new", async (ctx) => {
    const made = await addClaims(ctx, {
      membershipId: fd.get("membership"),
      tournamentId: fd.get("tournament"),
      entryId: fd.get("entry"),
      tournamentEventIds: fd.getAll("event"),
    });
    return { to: "/dashboard", msg: `Added ${made.length} event claim${made.length === 1 ? "" : "s"}.` };
  });
}

export async function editClaimAction(fd: FormData) {
  await act(fd, "/dashboard", async (ctx) => {
    await editClaim(ctx, { claimId: fd.get("claim"), revision: fd.get("revision"), entryId: fd.get("entry"), tournamentEventId: fd.get("event") });
    return { to: "/dashboard" };
  }, "Claim updated. Any earlier verification was reset.");
}

export async function withdrawClaimAction(fd: FormData) {
  await act(fd, "/dashboard", async (ctx) => {
    await withdrawClaim(ctx, { claimId: fd.get("claim") });
  }, "Claim withdrawn.");
}

export async function requestVerificationAction(fd: FormData) {
  await act(fd, "/dashboard", async (ctx) => {
    await requestVerification(ctx, {
      membershipId: fd.get("membership"),
      includeMembership: fd.get("includeMembership"),
      claimIds: fd.getAll("claim"),
      explanation: fd.get("explanation"),
    });
    return { to: "/dashboard" };
  }, "Verification requested. Your claims keep counting while they are reviewed.");
}

export async function decideSubmissionAction(fd: FormData) {
  // "Verify all unreviewed" verifies each self-reported or pending item that was left on "No decision".
  const bulk = fd.get("bulk") === "verify";
  await act(fd, "/admin", async (ctx) => {
    const item = (prefix: string, id: string): DecisionInput | null => {
      let decision = fd.get(`${prefix}:${id}:decision`);
      if ((!decision || decision === "skip") && bulk && fd.get(`${prefix}:${id}:bulk`) === "1") decision = "VERIFIED";
      if (!decision || decision === "skip") return null;
      return {
        id,
        revision: fd.get(`${prefix}:${id}:revision`),
        decision,
        publicReason: fd.get(`${prefix}:${id}:reason`),
        privateNote: fd.get(`${prefix}:${id}:note`),
      };
    };
    const membershipId = fd.get("membership");
    const membership = typeof membershipId === "string" ? item("m", membershipId) : null;
    const claims = fd
      .getAll("claim")
      .map((id) => item("c", String(id)))
      .filter((x): x is DecisionInput => x !== null);
    if (!membership && !claims.length) return { msg: "No decisions selected." };
    const results = await decideSubmission(ctx, { membership, claims });
    const failed = results.filter((r) => !r.ok);
    if (!failed.length) return { msg: `Recorded ${results.length} decision${results.length === 1 ? "" : "s"}.` };
    throw new ConflictError(
      `${results.length - failed.length} recorded; ${failed.length} not recorded: ${failed.map((f) => f.message).join(" ")}`,
    );
  });
}
