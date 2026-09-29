/**
 * Administrator policy. The only administrator is the Google account whose
 * provider-verified email is exactly ADMIN_EMAIL. Nothing else grants admin:
 * not a profile field, request body, cookie, client flag, school membership,
 * verification badge, or being the first user.
 */

export const ADMIN_EMAIL = "universal.scioly.rating@gmail.com";
export const GOOGLE_PROVIDER = "google";

/** Admin review mutations need a Google sign-in completed within this window. */
export const ADMIN_REAUTH_WINDOW_MS = 30 * 60 * 1000;

/** Session lifetime (sliding is not used: a session ends 14 days after sign-in). */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Lowercase + trim only. Gmail dots and +suffixes are deliberately NOT
 * removed: "universalscioly.rating@gmail.com" or "…+x@gmail.com" never match.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Trusted identity fields, as persisted from a validated Google ID token. */
export interface TrustedIdentity {
  provider: string;
  providerEmail: string;
  emailVerified: boolean;
}

export function isAdminIdentity(id: TrustedIdentity | null | undefined): boolean {
  if (!id) return false;
  return id.provider === GOOGLE_PROVIDER && id.emailVerified === true && normalizeEmail(id.providerEmail) === ADMIN_EMAIL;
}

/** Whether the session's last Google sign-in is recent enough for admin review mutations. */
export function isFreshAuthentication(authenticatedAt: string, now: Date): boolean {
  const t = Date.parse(authenticatedAt);
  return Number.isFinite(t) && now.getTime() - t <= ADMIN_REAUTH_WINDOW_MS && t <= now.getTime() + 60_000;
}
