import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/accounts/server";
import { googleConfigured } from "@/lib/auth/google";
import { safeReturnTo } from "@/lib/auth/return-to";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  config: "Google sign-in is not configured on this server yet.",
  unavailable: "Google sign-in is temporarily unavailable. Try again shortly.",
  state: "Your sign-in attempt could not be matched to this browser. Please try again.",
  expired: "Your sign-in attempt expired. Please try again.",
  denied: "Sign-in was cancelled.",
  unverified_email: "Your Google account's email address is not verified. Verify it with Google, then try again.",
  invalid_identity: "Google did not return a usable identity.",
  failed: "Sign-in failed. Please try again.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const returnTo = safeReturnTo(sp.returnTo);
  if (await currentActor()) redirect(returnTo);
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.failed) : null;
  return (
    <section className="card" style={{ maxWidth: 560 }}>
      <h1>Sign in</h1>
      {error ? (
        <p className="flash error" role="alert">
          {error}
        </p>
      ) : null}
      <p>
        Browsing ratings needs no account. Sign in to record the competitions and events you took part in and see an{" "}
        <b>Unofficial USR</b> estimated from those team-event results.
      </p>
      {googleConfigured() ? (
        <p>
          <a className="btn" href={`/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}>
            Continue with Google
          </a>
        </p>
      ) : (
        <p className="flash error">Google sign-in is not configured on this server yet.</p>
      )}
      <p className="muted" style={{ fontSize: 13 }}>
        scly.io asks Google only for your basic profile and email address, to recognize your account. Your email is never shown on the site.
        Your member profile is public by default; you can make it private in Settings.
      </p>
    </section>
  );
}
