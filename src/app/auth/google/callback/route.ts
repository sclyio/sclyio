import { NextResponse, type NextRequest } from "next/server";
import { accountsDb } from "@/lib/accounts/db";
import { OAUTH_COOKIE, SESSION_COOKIE, secureCookies } from "@/lib/accounts/server";
import { appOrigin, finishGoogleLogin } from "@/lib/auth/google";
import { safeReturnTo } from "@/lib/auth/return-to";
import { completeLogin, createSession, LoginError, revokeSession, unsign } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const MAX_AGE_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const origin = appOrigin();
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${code}`, origin));
    res.cookies.set(OAUTH_COOKIE(), "", { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  };
  const raw = unsign(req.cookies.get(OAUTH_COOKIE())?.value);
  if (!raw) return fail("state");
  let pending: { s: string; n: string; v: string; r: string; t: number };
  try {
    pending = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return fail("state");
  }
  if (!(Date.now() - pending.t < MAX_AGE_MS)) return fail("expired");
  if (req.nextUrl.searchParams.get("error")) return fail("denied");

  // Rebuild the callback URL on the configured origin (not the Host header).
  const current = new URL(`${origin}/auth/google/callback${req.nextUrl.search}`);
  const db = accountsDb();
  const now = new Date();
  let session;
  let onboarded = false;
  try {
    const identity = await finishGoogleLogin(current, { state: pending.s, nonce: pending.n, codeVerifier: pending.v });
    const account = await completeLogin(db, identity, now);
    // Rotate: any previous session on this browser ends.
    await revokeSession(db, req.cookies.get(SESSION_COOKIE())?.value, now);
    session = await createSession(db, account.userId, account.oauthAccountId, now);
    const u = await db.execute({ sql: `SELECT onboarded_at FROM users WHERE id = ?`, args: [account.userId] });
    onboarded = Boolean(u.rows[0]?.[0]);
  } catch (e) {
    if (e instanceof LoginError) return fail(e.code);
    // Log only the error class: never codes, tokens, or secrets.
    console.warn(`google sign-in failed: ${e instanceof Error ? e.name : "error"}`);
    return fail("failed");
  }
  const dest = onboarded ? safeReturnTo(pending.r) : "/onboarding";
  const res = NextResponse.redirect(new URL(dest, origin));
  res.cookies.set(OAUTH_COOKIE(), "", { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(SESSION_COOKIE(), session.token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
