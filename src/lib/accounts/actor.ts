import type { Client, InArgs } from "@libsql/client";
import { isAdminIdentity, isFreshAuthentication } from "../auth/policy";
import { resolveSession, verifyCsrf, type SessionRecord } from "../auth/session";
import { AccessError } from "./errors";

/** Read access to the active results dataset (read.ts in the app; a local file in tests). */
export interface DataSource {
  all<T = Record<string, unknown>>(sql: string, args?: InArgs): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, args?: InArgs): Promise<T | undefined>;
}

/**
 * Everything a domain operation may trust about the request. The session
 * token and CSRF token come from the cookie / submitted form; the identity
 * behind them is always re-read from the accounts database.
 */
export interface Ctx {
  db: Client;
  data: DataSource;
  now: Date;
  sessionToken: string | null;
  csrf?: string | null;
}

export interface Actor {
  userId: string;
  sessionId: string;
  oauthAccountId: string;
  displayName: string | null;
  onboarded: boolean;
  profilePrivate: boolean;
  isAdmin: boolean;
  authenticatedAt: string;
}

function toActor(s: SessionRecord): Actor {
  return {
    userId: s.userId,
    sessionId: s.sessionId,
    oauthAccountId: s.oauthAccountId,
    displayName: s.displayName,
    onboarded: Boolean(s.onboardedAt),
    profilePrivate: s.profilePrivate,
    // Computed from the persisted Google identity on every request; there is no stored role.
    isAdmin: isAdminIdentity({ provider: s.provider, providerEmail: s.providerEmail, emailVerified: s.emailVerified }),
    authenticatedAt: s.authenticatedAt,
  };
}

export async function authenticate(ctx: Ctx): Promise<Actor | null> {
  const s = await resolveSession(ctx.db, ctx.sessionToken, ctx.now);
  return s ? toActor(s) : null;
}

/** A signed-in user. Mutations also require the session's CSRF token. */
export async function requireUser(ctx: Ctx, opts: { mutation?: boolean } = {}): Promise<Actor> {
  const actor = await authenticate(ctx);
  if (!actor) throw new AccessError("unauthenticated");
  if (opts.mutation && !verifyCsrf(actor.sessionId, ctx.csrf)) throw new AccessError("csrf");
  return actor;
}

/**
 * The single administrator authorization policy:
 *  - an active session for a Google-authenticated account,
 *  - Google reported email_verified = true for that identity,
 *  - the provider email, lowercased and trimmed, is exactly ADMIN_EMAIL,
 *  - for review mutations: a Google sign-in within ADMIN_REAUTH_WINDOW_MS, plus CSRF.
 * Checked on every admin page load and every admin action.
 */
export async function requireAdmin(ctx: Ctx, opts: { mutation?: boolean } = {}): Promise<Actor> {
  const actor = await authenticate(ctx);
  if (!actor) throw new AccessError("unauthenticated");
  if (!actor.isAdmin) throw new AccessError("forbidden");
  if (opts.mutation) {
    if (!verifyCsrf(actor.sessionId, ctx.csrf)) throw new AccessError("csrf");
    if (!isFreshAuthentication(actor.authenticatedAt, ctx.now)) throw new AccessError("reauth_required");
  }
  return actor;
}
