import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appOrigin } from "../auth/google";
import { csrfToken } from "../auth/session";
import { all, get } from "../db/read";
import { authenticate, type Actor, type Ctx } from "./actor";
import { accountsDb } from "./db";

/** Request-scoped glue between Next.js (cookies, forms) and the domain layer. */

export const secureCookies = () => appOrigin().startsWith("https://");
/** __Host- prefix in production: Secure, Path=/, no Domain (cannot be set by a subdomain). */
export const SESSION_COOKIE = () => (secureCookies() ? "__Host-sclyio_session" : "sclyio_session");
export const OAUTH_COOKIE = () => (secureCookies() ? "__Host-sclyio_oauth" : "sclyio_oauth");

export const dataSource = { all, get };

export async function requestCtx(form?: FormData): Promise<Ctx> {
  const jar = await cookies();
  const csrf = form?.get("csrf");
  return {
    db: accountsDb(),
    data: dataSource,
    now: new Date(),
    sessionToken: jar.get(SESSION_COOKIE())?.value ?? null,
    csrf: typeof csrf === "string" ? csrf : null,
  };
}

/** The signed-in actor for this request (memoized per request). */
export const currentActor = cache(async (): Promise<Actor | null> => authenticate(await requestCtx()));

/** Page guard: redirect to sign-in, and to onboarding until it is complete. */
export async function pageUser(path: string, opts: { allowNotOnboarded?: boolean } = {}) {
  const actor = await currentActor();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(path)}`);
  if (!actor.onboarded && !opts.allowNotOnboarded) redirect("/onboarding");
  return { actor, csrf: csrfToken(actor.sessionId), ctx: await requestCtx() };
}
