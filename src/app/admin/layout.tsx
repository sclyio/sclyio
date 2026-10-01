import Link from "next/link";
import { notFound } from "next/navigation";
import { Csrf } from "@/components/account";
import { SubmitButton } from "@/components/submit-button";
import { currentActor } from "@/lib/accounts/server";
import { csrfToken } from "@/lib/auth/session";
import { logoutAction } from "../(account)/actions";
import { AdminNav } from "./nav";

/**
 * The admin portal, separate from the member area. Anyone but the admin gets
 * a plain 404; each page and action still re-checks requireAdmin() itself.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const actor = await currentActor();
  if (!actor?.isAdmin) notFound();
  return (
    <>
      <div className="acct-bar admin-bar">
        <span className="admin-mark">Admin portal</span>
        <AdminNav />
        <form action={logoutAction}>
          <Link href="/dashboard" className="muted" style={{ marginRight: 12 }}>
            Member dashboard
          </Link>
          <Csrf token={csrfToken(actor.sessionId)} />
          <SubmitButton className="btn-quiet" pending="Signing out…">
            Log out
          </SubmitButton>
        </form>
      </div>
      {children}
    </>
  );
}
