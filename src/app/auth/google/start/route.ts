import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, secureCookies } from "@/lib/accounts/server";
import { appOrigin, googleConfigured, startGoogleLogin } from "@/lib/auth/google";
import { safeReturnTo } from "@/lib/auth/return-to";
import { sign } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Begin Google sign-in: state, nonce, and PKCE verifier go into a short-lived signed HttpOnly cookie. */
export async function GET(req: NextRequest) {
  const origin = appOrigin();
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=config", origin));
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const reauth = req.nextUrl.searchParams.get("reauth") === "1";
  let start;
  try {
    start = await startGoogleLogin({ reauth });
  } catch {
    return NextResponse.redirect(new URL("/login?error=unavailable", origin));
  }
  const res = NextResponse.redirect(start.url);
  const payload = Buffer.from(
    JSON.stringify({ s: start.state, n: start.nonce, v: start.codeVerifier, r: returnTo, t: Date.now() }),
  ).toString("base64url");
  res.cookies.set(OAUTH_COOKIE(), sign(payload), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax", // sent on Google's top-level redirect back to the callback
    path: "/",
    maxAge: 600,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
