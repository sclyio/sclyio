import type { Metadata } from "next";
import Link from "next/link";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { SubmitButton } from "@/components/submit-button";
import { memberships } from "@/lib/accounts/claims";
import { pageUser } from "@/lib/accounts/server";
import { logoutEverywhereAction, privacyAction, saveDisplayNameAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function Settings(props: PageProps<"/settings/profile">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { actor, csrf, ctx } = await pageUser("/settings/profile");
  const ms = await memberships(ctx, actor.userId);

  return (
    <>
      <h1>Settings</h1>
      <Flash sp={sp} />
      <section className="card">
        <h2>Display name</h2>
        <form action={saveDisplayNameAction} className="inline-form">
          <Csrf token={csrf} />
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" name="displayName" defaultValue={actor.displayName ?? ""} required minLength={2} maxLength={40} />
          </div>
          <SubmitButton>Save</SubmitButton>
        </form>
        <p className="muted" style={{ fontSize: 13 }}>
          Changing your display name does not affect verification.
        </p>
      </section>

      <section className="card">
        <h2>Profile visibility</h2>
        <p>
          Your profile is <b>{actor.profilePrivate ? "private" : "public"}</b>.{" "}
          {actor.profilePrivate
            ? "Only you can see it, and you are not listed on your schools' Members tabs."
            : "Anyone can see your display name, school affiliations, claimed events, and Unofficial USR, and you are listed on your schools' Members tabs."}{" "}
          Your Google email is never shown.
        </p>
        <form action={privacyAction} className="inline-form">
          <Csrf token={csrf} />
          <input type="hidden" name="private" value={actor.profilePrivate ? "0" : "1"} />
          <SubmitButton className="btn-quiet">{actor.profilePrivate ? "Make my profile public" : "Make my profile private"}</SubmitButton>
          <Link href={`/members/${actor.userId}`}>View my profile</Link>
        </form>
      </section>

      <section className="card flush">
        <div className="card-head">
          <h2 style={{ margin: 0 }}>School affiliations</h2>
          <Link className="btn btn-quiet" href="/onboarding?add=1">
            Add school or season
          </Link>
        </div>
        <ul className="rows">
          {ms.map((m) => (
            <li key={m.id} className="row">
              <span className="who">
                <b>{m.school_name}</b> <StatusTag status={m.status} subject="Affiliation" />
                <div className="sub">{divSeason(m.division, m.season)}</div>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: 13, padding: "0 16px 12px", margin: 0 }}>
          Each affiliation covers a whole season. You can be at different schools in different seasons, but only one school per season.
        </p>
      </section>

      <section className="card">
        <h2>Sessions</h2>
        <p className="muted">Sign out of scly.io on every device where you are signed in.</p>
        <form action={logoutEverywhereAction}>
          <Csrf token={csrf} />
          <SubmitButton className="btn-danger" pending="Signing out…">
            Log out everywhere
          </SubmitButton>
        </form>
      </section>
    </>
  );
}
