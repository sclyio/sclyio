import type { Metadata } from "next";
import Link from "next/link";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { SubmitButton } from "@/components/submit-button";
import { memberships } from "@/lib/accounts/claims";
import { schoolById, searchSchools } from "@/lib/accounts/dataset";
import { dataSource, pageUser } from "@/lib/accounts/server";
import { logoutEverywhereAction, saveDisplayNameAction, transferAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function Settings(props: PageProps<"/settings/profile">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { actor, csrf, ctx } = await pageUser("/settings/profile");
  const ms = await memberships(ctx, actor.userId);
  const transferring = ms.find((m) => m.id === sp.transfer && !m.ends_on);
  const results = transferring && sp.q && sp.q.trim().length >= 2 ? await searchSchools(dataSource, sp.q) : [];
  const target = transferring && sp.to ? await schoolById(dataSource, sp.to) : null;

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
          Changing your display name does not affect verification. Your profile is private and not listed publicly.
        </p>
      </section>

      <section className="card flush">
        <div className="card-head">
          <h2 style={{ margin: 0 }}>School affiliations</h2>
          <Link className="btn btn-quiet" href="/onboarding?add=1">
            Add season
          </Link>
        </div>
        <ul className="rows">
          {ms.map((m) => (
            <li key={m.id} className="row" style={{ flexWrap: "wrap" }}>
              <span className="who">
                <b>{m.school_name}</b> <StatusTag status={m.status} subject="Affiliation" />
                <div className="sub">
                  {divSeason(m.division, m.season)}
                  {m.starts_on ? ` · from ${m.starts_on}` : ""}
                  {m.ends_on ? ` · ended ${m.ends_on}` : ""}
                </div>
              </span>
              {!m.ends_on ? (
                <Link className="btn btn-quiet" href={`/settings/profile?transfer=${m.id}`}>
                  Transfer school
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {transferring ? (
        <section className="card">
          <h2>Transfer from {transferring.school_name}</h2>
          <p className="muted">
            Your existing claims stay with {transferring.school_name}. The new affiliation starts unverified; verification does not carry over.
          </p>
          {!target ? (
            <>
              <form action="/settings/profile" className="inline-form" role="search">
                <input type="hidden" name="transfer" value={transferring.id} />
                <div className="field">
                  <label htmlFor="q">New school</label>
                  <input id="q" name="q" defaultValue={sp.q ?? ""} required minLength={2} />
                </div>
                <button type="submit">Search</button>
              </form>
              {results.length ? (
                <ul className="choice-list">
                  {results.map((s) => (
                    <li key={s.id}>
                      <Link href={`/settings/profile?transfer=${transferring.id}&to=${encodeURIComponent(s.id)}`}>
                        <span>
                          <b>{s.name}</b>
                          <div className="sub">{[s.city, s.state].filter(Boolean).join(", ")}</div>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : sp.q ? (
                <p className="muted">No matching imported school.</p>
              ) : null}
            </>
          ) : (
            <form action={transferAction}>
              <Csrf token={csrf} />
              <input type="hidden" name="membership" value={transferring.id} />
              <input type="hidden" name="school" value={target.id} />
              <input type="hidden" name="back" value={`/settings/profile?transfer=${transferring.id}&to=${encodeURIComponent(target.id)}`} />
              <p>
                New school: <b>{target.name}</b> ({[target.city, target.state].filter(Boolean).join(", ")})
              </p>
              <div className="field">
                <label htmlFor="effective">First day at the new school</label>
                <input id="effective" name="effective" type="date" required />
              </div>
              <SubmitButton>Record transfer</SubmitButton> <Link href="/settings/profile">Cancel</Link>
            </form>
          )}
        </section>
      ) : null}

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
