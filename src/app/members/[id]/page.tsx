import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { divSeason, VerifiedIcon } from "@/components/account";
import { PersonalRatingCard } from "@/components/personal";
import { Avatar } from "@/components/plain";
import { accountsDb, ensureAccountsSchema } from "@/lib/accounts/db";
import { publicProfile } from "@/lib/accounts/public";
import { currentActor, dataSource } from "@/lib/accounts/server";

export const dynamic = "force-dynamic";
// Member profiles are public by choice but kept out of search engines.
export const metadata: Metadata = { title: "Member", robots: { index: false, follow: false } };

export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const { id } = await props.params;
  await ensureAccountsSchema();
  const viewer = await currentActor();
  const p = await publicProfile(accountsDb(), dataSource, decodeURIComponent(id), viewer?.userId ?? null, new Date());
  // Private and missing profiles are indistinguishable to other visitors.
  if (!p) notFound();
  const own = viewer?.userId === p.userId;

  return (
    <>
      {p.isPrivate ? (
        <p className="flash ok" role="status">
          Your profile is private: only you can see this page. <Link href="/settings/profile">Change in Settings</Link>
        </p>
      ) : null}
      <section className="card">
        <div className="profile">
          <Avatar name={p.displayName} />
          <div>
            <h1 className="profile-name">{p.displayName}</h1>
            <div className="profile-sub">Science Olympiad member{own ? " · this is you" : ""}</div>
          </div>
        </div>
        {p.memberships.length ? (
          <ul className="rows" style={{ marginTop: 12 }} aria-label="School affiliations">
            {p.memberships.map((m) => (
              <li key={m.id} className="row" style={{ paddingLeft: 0 }}>
                <span className="who">
                  <Link href={`/schools/${encodeURIComponent(m.school_id)}?tab=members`}>{m.school_name}</Link>
                  <VerifiedIcon verified={m.status === "VERIFIED"} />
                  <div className="sub">{divSeason(m.division, m.season)}</div>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {p.ratings.map((r) => (
        <PersonalRatingCard key={`${r.division}${r.season}`} division={r.division} season={r.season} view={r.view} own={own} />
      ))}

      <section className="card flush">
        <div className="card-head">
          <h2 style={{ margin: 0 }}>Claimed competitions</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            <VerifiedIcon verified /> verified · <VerifiedIcon verified={false} /> self-reported
          </span>
        </div>
        {p.claims.length ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Competition</th>
                  <th>Team entry</th>
                  <th>Event</th>
                  <th>Official result</th>
                  <th>Claim</th>
                </tr>
              </thead>
              <tbody>
                {p.claims.map((c) => {
                  const verified = c.claim.status === "VERIFIED" && c.claim.source_state === "current";
                  return (
                    <tr key={c.claim.id}>
                      <td>
                        {c.resultUrl ? (
                          <a href={c.resultUrl} target="_blank" rel="noopener noreferrer">
                            {c.tournamentName}
                          </a>
                        ) : (
                          c.tournamentName
                        )}
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.tournamentDate}
                        </div>
                      </td>
                      <td>{c.entryText}</td>
                      <td>{c.eventName}</td>
                      <td>{c.resultText}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <VerifiedIcon verified={verified} /> {verified ? "Verified" : "Self-reported"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ padding: "12px 16px", margin: 0 }}>
            No claimed competitions yet.
          </p>
        )}
      </section>
    </>
  );
}
