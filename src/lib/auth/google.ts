import "server-only";
import * as oidc from "openid-client";

/**
 * Google OpenID Connect (server-side authorization-code flow) via
 * openid-client, a certified OIDC relying-party library. It generates and
 * checks state, nonce, and PKCE (S256), and validates the ID token: issuer,
 * audience (our client id), expiry/iat, nonce, and — with
 * enableNonRepudiationChecks — the JWS signature against Google's JWKS.
 *
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   OAuth 2.0 Web client
 *   APP_ORIGIN                               https://scly.io (or http://localhost:3000)
 * Scopes: openid email profile. No offline access; tokens are discarded.
 */

export const GOOGLE_ISSUER = "https://accounts.google.com";
export const SCOPES = "openid email profile";

export function appOrigin(): string {
  const o = process.env.APP_ORIGIN;
  if (o) return new URL(o).origin;
  if (process.env.NODE_ENV === "production") throw new Error("APP_ORIGIN must be set in production.");
  return "http://localhost:3000";
}

export const redirectUri = () => `${appOrigin()}/auth/google/callback`;

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SESSION_SECRET);
}

let config: Promise<oidc.Configuration> | null = null;

export function googleConfig(): Promise<oidc.Configuration> {
  if (!config) {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) throw new Error("Google sign-in is not configured.");
    config = oidc
      .discovery(new URL(GOOGLE_ISSUER), id, secret, undefined, { execute: [oidc.enableNonRepudiationChecks] })
      .catch((e) => {
        config = null; // retry discovery on the next request
        throw e;
      });
  }
  return config;
}

export interface AuthStart {
  url: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export async function startGoogleLogin(opts: { reauth: boolean }): Promise<AuthStart> {
  const cfg = await googleConfig();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const params: Record<string, string> = {
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
  };
  // Google has no prompt=login / max_age; select_account forces an interactive
  // Google step, and the session's authenticated_at records its completion.
  if (opts.reauth) params.prompt = "select_account";
  return { url: oidc.buildAuthorizationUrl(cfg, params), state, nonce, codeVerifier };
}

/** Exchange the code and return the validated identity claims (tokens are not retained). */
export async function finishGoogleLogin(currentUrl: URL, check: { state: string; nonce: string; codeVerifier: string }) {
  const cfg = await googleConfig();
  const tokens = await oidc.authorizationCodeGrant(cfg, currentUrl, {
    pkceCodeVerifier: check.codeVerifier,
    expectedState: check.state,
    expectedNonce: check.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims || (claims.iss !== GOOGLE_ISSUER && claims.iss !== "accounts.google.com")) throw new Error("unexpected issuer");
  return {
    subject: String(claims.sub ?? ""),
    email: typeof claims.email === "string" ? claims.email : "",
    emailVerified: claims.email_verified === true,
  };
}
