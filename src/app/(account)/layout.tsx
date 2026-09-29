import Link from "next/link";
import { currentActor } from "@/lib/accounts/server";
import { csrfToken } from "@/lib/auth/session";
import { Csrf } from "@/components/account";
import { SubmitButton } from "@/components/submit-button";
import { logoutAction } from "./actions";

/** Signed-in pages: account navigation and log out on every page. Never cached across users. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  return (
    <>
      {actor ? (
        <div className="acct-bar">
          <span className="muted">Signed in{actor.displayName ? ` as ${actor.displayName}` : ""}</span>
          <nav aria-label="Account">
            {actor.onboarded ? <Link href="/dashboard">Dashboard</Link> : <Link href="/onboarding">Finish setup</Link>}
            <Link href="/settings/profile">Settings</Link>
            {actor.isAdmin ? <Link href="/admin/verifications">Verifications</Link> : null}
          </nav>
          <form action={logoutAction}>
            <Csrf token={csrfToken(actor.sessionId)} />
            <SubmitButton className="btn-quiet" pending="Signing out…">
              Log out
            </SubmitButton>
          </form>
        </div>
      ) : null}
      {children}
    </>
  );
}
