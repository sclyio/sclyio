/** Errors raised by the accounts domain layer. Messages are safe to show to the acting user. */

export type AccessCode = "unauthenticated" | "forbidden" | "csrf" | "reauth_required";

export class AccessError extends Error {
  constructor(
    public code: AccessCode,
    message = code === "unauthenticated"
      ? "Please sign in."
      : code === "csrf"
        ? "This form expired. Reload the page and try again."
        : code === "reauth_required"
          ? "Sign in with Google again (within the last 30 minutes) to review claims."
          : "You do not have access to this.",
  ) {
    super(message);
    this.name = "AccessError";
  }
}

/** Invalid, mismatched, or fabricated input. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Duplicate claim, stale revision, or an invalid status transition. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export function isDomainError(e: unknown): e is AccessError | ValidationError | ConflictError {
  return e instanceof AccessError || e instanceof ValidationError || e instanceof ConflictError;
}
