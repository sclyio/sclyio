/** Same-origin post-login destinations. Anything else falls back to /dashboard. */
const ALLOWED = ["/dashboard", "/onboarding", "/settings/profile", "/admin"];

export function safeReturnTo(raw: unknown, fallback = "/dashboard"): string {
  if (typeof raw !== "string" || raw.length > 300) return fallback;
  // Only plain absolute paths: no scheme, no protocol-relative "//", no backslashes or control characters.
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://x.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://x.invalid") return fallback;
  const ok = ALLOWED.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
  return ok ? `${url.pathname}${url.search}` : fallback;
}
