import { accountsDb, AccountsConfigError, AccountsSchemaError, ensureAccountsSchema } from "@/lib/accounts/db";
import { appOrigin, googleConfigured, redirectUri } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

/**
 * Deployment health for the account system: status codes only, never secrets
 * or connection strings. The redirect URI is already public (Google sees it).
 */
export async function GET() {
  let accounts = "ok";
  try {
    await ensureAccountsSchema(accountsDb());
  } catch (e) {
    accounts = e instanceof AccountsConfigError ? e.code : e instanceof AccountsSchemaError ? "not_migrated" : "error";
  }
  let origin: string | null = null;
  try {
    origin = appOrigin();
  } catch {
    origin = null;
  }
  return Response.json(
    {
      accounts,
      google: googleConfigured() ? "configured" : "missing",
      sessionSecret: (process.env.SESSION_SECRET?.trim().length ?? 0) >= 32 ? "ok" : "missing_or_short",
      origin,
      redirectUri: origin ? redirectUri() : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
