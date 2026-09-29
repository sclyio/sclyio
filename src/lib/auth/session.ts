import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Client } from "@libsql/client";
import { newId, row, run, sha256, tx } from "../accounts/db";
import { GOOGLE_PROVIDER, SESSION_TTL_MS } from "./policy";

/**
 * Accounts and revocable database sessions. The cookie carries a random
 * 256-bit token; only its SHA-256 is stored. No Google access or refresh
 * token is kept: the ID token's validated claims are all that login needs.
 */

/** Claims taken from an ID token that openid-client has already validated. */
export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
}

export class LoginError extends Error {
  constructor(public code: "unverified_email" | "invalid_identity") {
    super(code === "unverified_email" ? "Your Google account email is not verified." : "Google did not return a usable identity.");
    this.name = "LoginError";
  }
}

/**
 * Find or create the account for a Google identity, keyed by (provider,
 * subject) — never by email, so a matching email never links accounts.
 * Repeated sign-ins update the stored provider email and verification flag.
 */
export async function completeLogin(db: Client, id: VerifiedGoogleIdentity, now: Date) {
  if (!id.subject || typeof id.subject !== "string" || !id.email) throw new LoginError("invalid_identity");
  if (id.emailVerified !== true) throw new LoginError("unverified_email");
  const at = now.toISOString();
  return tx(db, async (t) => {
    const existing = await row<{ id: string; user_id: string }>(
      t,
      `SELECT id, user_id FROM oauth_accounts WHERE provider = ? AND subject = ?`,
      [GOOGLE_PROVIDER, id.subject],
    );
    if (existing) {
      await run(t, `UPDATE oauth_accounts SET provider_email = ?, email_verified = 1, last_login_at = ? WHERE id = ?`, [
        id.email,
        at,
        existing.id,
      ]);
      return { userId: existing.user_id, oauthAccountId: existing.id, isNew: false };
    }
    const userId = newId("usr");
    const oauthAccountId = newId("oa");
    await run(t, `INSERT INTO users (id, display_name, created_at, updated_at) VALUES (?, NULL, ?, ?)`, [userId, at, at]);
    await run(
      t,
      `INSERT INTO oauth_accounts (id, user_id, provider, subject, provider_email, email_verified, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [oauthAccountId, userId, GOOGLE_PROVIDER, id.subject, id.email, at, at],
    );
    return { userId, oauthAccountId, isNew: true };
  });
}

export async function createSession(db: Client, userId: string, oauthAccountId: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const at = now.toISOString();
  await run(
    db,
    `INSERT INTO sessions (id, user_id, oauth_account_id, created_at, expires_at, authenticated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sha256(token), userId, oauthAccountId, at, expiresAt.toISOString(), at, at],
  );
  return { token, expiresAt };
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  oauthAccountId: string;
  provider: string;
  providerEmail: string;
  emailVerified: boolean;
  authenticatedAt: string;
  expiresAt: string;
  displayName: string | null;
  onboardedAt: string | null;
  profilePrivate: boolean;
}

/** Active, unexpired, unrevoked session for a cookie token, joined with its trusted identity. */
export async function resolveSession(db: Client, token: string | null | undefined, now: Date): Promise<SessionRecord | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const r = await row<Record<string, unknown>>(
    db,
    `SELECT s.id, s.user_id, s.oauth_account_id, s.authenticated_at, s.expires_at, s.revoked_at,
            o.provider, o.provider_email, o.email_verified, o.user_id AS o_user, u.display_name, u.onboarded_at, u.profile_private
     FROM sessions s JOIN oauth_accounts o ON o.id = s.oauth_account_id JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [sha256(token)],
  );
  if (!r || r.revoked_at || r.o_user !== r.user_id) return null;
  if (Date.parse(r.expires_at as string) <= now.getTime()) return null;
  return {
    sessionId: r.id as string,
    userId: r.user_id as string,
    oauthAccountId: r.oauth_account_id as string,
    provider: r.provider as string,
    providerEmail: r.provider_email as string,
    emailVerified: r.email_verified === 1,
    authenticatedAt: r.authenticated_at as string,
    expiresAt: r.expires_at as string,
    displayName: (r.display_name as string | null) ?? null,
    onboardedAt: (r.onboarded_at as string | null) ?? null,
    profilePrivate: r.profile_private === 1,
  };
}

export async function revokeSession(db: Client, token: string | null | undefined, now: Date) {
  if (!token) return;
  await run(db, `UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, [now.toISOString(), sha256(token)]);
}

export async function revokeAllSessions(db: Client, userId: string, now: Date) {
  await run(db, `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [now.toISOString(), userId]);
}

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters).");
  return s;
}

/** Per-session CSRF token (HMAC of the session id), embedded in every mutating form. */
export function csrfToken(sessionId: string): string {
  return createHmac("sha256", sessionSecret()).update(`csrf:${sessionId}`).digest("base64url");
}

export function verifyCsrf(sessionId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(csrfToken(sessionId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** HMAC-signed short-lived values (the OAuth state/nonce/PKCE cookie). */
export function sign(value: string): string {
  return `${value}.${createHmac("sha256", sessionSecret()).update(`v:${value}`).digest("base64url")}`;
}

export function unsign(signed: string | null | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(sign(value));
  const b = Buffer.from(signed);
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}
