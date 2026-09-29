import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerifiedIcon } from "@/components/account";
import { Avatar, seasonLabel, seasonRange, Tabs, TournamentLink, usr } from "@/components/plain";
import { RatingChart } from "@/components/rating-chart";
import type { DashClaim } from "@/lib/accounts/dashboard";
import { accountsDb } from "@/lib/accounts/db";
import { publicProfile } from "@/lib/accounts/public";
import { currentActor, dataSource } from "@/lib/accounts/server";
import type { PersonalSnapshot } from "@/lib/personal/snapshots";

export const dynamic = "force-dynamic";
// Member profiles are public by choice but kept out of search engines.
export const metadata: Metadata = { title: "Member", robots: { index: false, follow: false } };

const isVerified = (c: DashClaim) => c.claim.status === "VERIFIED" && c.claim.source_state === "current";

/** Member profile, laid out like a team profile: header with USR and Season Trend, then Results / Events / Rating History. */
export default async function MemberPage(props: PageProps<"/members/[id]">) {
  const { id } = await props.params;
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const viewer = await currentActor(); // reads cookies (per-request) and checks the accounts schema
  const p = await publicProfile(accountsDb(), dataSource, decodeURIComponent(id), viewer?.userId ?? null, new Date());
  // Private and missing profiles are indistinguishable to other visitors.
  if (!p) notFound();
  const own = viewer?.userId === p.userId;
  const tab = sp.tab === "events" || sp.tab === "history" ? sp.tab : "results";

  // One division at a time, like a team (a member can have both B and C seasons).
  const divisions = [...new Set([...p.memberships.map((m) => m.division), ...p.claims.map((c) => c.claim.division)])].sort().reverse();
  const latestDivision = p.ratings[0]?.division ?? p.memberships[0]?.division ?? divisions[0] ?? "C";
  const division = divisions.includes(sp.div ?? "") ? sp.div! : latestDivision;
  const memberships = p.memberships.filter((m) => m.division === division);
  const claims = p.claims.filter((c) => c.claim.division === division);
  const snaps = new Map<number, PersonalSnapshot>();
  for (const r of p.ratings) if (r.division === division && !r.view.pending && r.view.snapshot) snaps.set(r.season, r.view.snapshot);
  const claimSeasons = [...new Set(claims.map((c) => c.claim.season))].sort((a, b) => b - a);
  const ratedSeasons = [...snaps.keys()].sort((a, b) => b - a);
  const latest = ratedSeasons.length ? snaps.get(ratedSeasons[0])! : null;
  const season = ratedSeasons.includes(Number(sp.season)) ? Number(sp.season) : ratedSeasons[0];
  const memberSeasons = memberships.map((m) => m.season);
  const currentSchool = memberships[0];
  const schools = [...new Map(memberships.map((m) => [m.school_id, m])).values()];
  const verifiedClaims = claims.filter(isVerified).length;

  const base = `/members/${encodeURIComponent(p.userId)}`;
  const q = (extra: string) => {
    const parts = [division !== latestDivision ? `div=${division}` : "", extra].filter(Boolean);
    return parts.length ? `${base}?${parts.join("&")}` : base;
  };
  const rated = latest?.state === "rated";
  const status = !latest ? "Unrated" : latest.state !== "rated" ? "No comparable estimate" : latest.provisional ? "Provisional" : "Unofficial";

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
            <div className="profile-sub">
              {currentSchool ? (
                <>
                  <Link href={`/schools/${encodeURIComponent(currentSchool.school_id)}?tab=members`}>{currentSchool.school_name}</Link>
                  <VerifiedIcon verified={currentSchool.status === "VERIFIED"} /> ·{" "}
                </>
              ) : null}
              Division {division}
              {memberSeasons.length ? ` · ${seasonRange(Math.min(...memberSeasons), Math.max(...memberSeasons))}` : ""}
              {own ? " · this is you" : ""}
            </div>
            {divisions.length > 1 ? (
              <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
                {divisions.map((d) => (
                  <Link key={d} className={d === division ? "chip on" : "chip"} href={d === latestDivision ? base : `${base}?div=${d}`}>
                    Division {d}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="badges">
            <div className="badge unofficial">
              <div className="badge-label">UNOFFICIAL USR</div>
              <div className="badge-value">{rated ? usr(latest!.summaryUsr) : "-"}</div>
              <div className="badge-sub">{status}</div>
            </div>
            <div className="badge trend unofficial">
              <div className="badge-label">SEASON TREND</div>
              <div className="badge-value">{latest?.trendState === "rated" ? usr(latest.trendUsr) : "-"}</div>
              <div className="badge-sub">{ratedSeasons.length ? seasonLabel(ratedSeasons[0]) : ""}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <span className="stat">
            <b>{latest?.ratedEvents ?? 0}</b>
            <span>Events rated</span>
          </span>
          <span className="stat">
            <b>{new Set(claims.map((c) => c.claim.tournament_id)).size}</b>
            <span>Competitions</span>
          </span>
          <span className="stat">
            <b>{claimSeasons.length}</b>
            <span>Seasons</span>
          </span>
          <span className="stat">
            <b>
              {verifiedClaims}/{claims.length}
            </b>
            <span>Claims verified</span>
          </span>
          <span className="stat">
            <b>{schools.length}</b>
            <span>{schools.length === 1 ? "School" : "Schools"}</span>
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>
          Estimated from {own ? "your" : "their"} claimed team-event results. It does not isolate {own ? "your" : "their"} individual contribution
          and is not comparable to a team or school rating.
        </p>
      </section>

      <Tabs
        active={tab}
        items={[
          { key: "results", label: "Results", href: q("") },
          { key: "events", label: "Events", href: q(`${season && season !== ratedSeasons[0] ? `season=${season}&` : ""}tab=events`) },
          { key: "history", label: "Rating History", href: q("tab=history") },
        ]}
      />

      {tab === "results" ? (
        <Results claims={claims} seasons={claimSeasons} schools={memberships} />
      ) : tab === "events" ? (
        <Events snaps={snaps} seasons={ratedSeasons} season={season} claims={claims} href={(s) => q(`season=${s}&tab=events`)} />
      ) : (
        <History snaps={snaps} seasons={ratedSeasons} label={p.displayName} />
      )}
    </>
  );
}

function Results({ claims, seasons, schools }: { claims: DashClaim[]; seasons: number[]; schools: { school_name: string; season: number }[] }) {
  if (!claims.length) return <p className="muted">No claimed competitions yet.</p>;
  return (
    <>
      <p className="muted" style={{ fontSize: 13 }}>
        <VerifiedIcon verified /> verified by the scly.io admin · <VerifiedIcon verified={false} /> self-reported
      </p>
      {seasons.map((s) => {
        const groups = new Map<string, DashClaim[]>();
        for (const c of claims.filter((x) => x.claim.season === s)) {
          const k = `${c.claim.tournament_id}|${c.claim.entry_id}`;
          let arr = groups.get(k);
          if (!arr) groups.set(k, (arr = []));
          arr.push(c);
        }
        const school = schools.find((x) => x.season === s);
        return (
          <div key={s}>
            <h2 className="season-head">
              {seasonLabel(s)}
              {school ? ` · ${school.school_name}` : ""}
            </h2>
            {[...groups.values()]
              .sort((a, b) => b[0].tournamentDate.localeCompare(a[0].tournamentDate))
              .map((g) => {
                const first = g[0];
                const verified = g.filter(isVerified).length;
                return (
                  <section key={`${first.claim.tournament_id}|${first.claim.entry_id}`} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        {first.resultUrl ? <TournamentLink url={first.resultUrl} name={first.tournamentName} bold /> : <b>{first.tournamentName}</b>}
                        <div className="muted">
                          {first.tournamentDate}
                          {first.tournamentLevel ? ` · ${first.tournamentLevel}` : ""} · {first.entryText}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                        <span className="stat" style={{ margin: 0 }}>
                          <b>{g.length}</b>
                          <span>{g.length === 1 ? "event" : "events"}</span>
                        </span>
                        <span className="stat" style={{ margin: 0 }}>
                          <b>
                            {verified}/{g.length}
                          </b>
                          <span>verified</span>
                        </span>
                      </div>
                    </div>
                    <ul className="ev-list">
                      {[...g]
                        .sort((a, b) => a.eventName.localeCompare(b.eventName))
                        .map((c) => (
                          <li key={c.claim.id}>
                            <span>{c.eventName}</span>
                            <span className="muted">{c.resultText}</span>
                            <VerifiedIcon verified={isVerified(c)} />
                          </li>
                        ))}
                    </ul>
                  </section>
                );
              })}
          </div>
        );
      })}
    </>
  );
}

function Events(props: { snaps: Map<number, PersonalSnapshot>; seasons: number[]; season: number | undefined; claims: DashClaim[]; href: (s: number) => string }) {
  const s = props.season === undefined ? null : props.snaps.get(props.season);
  if (!s) return <p className="muted">No rated events yet.</p>;
  const byClaim = new Map(props.claims.map((c) => [c.claim.id, c]));
  const places = new Map<string, string[]>();
  for (const e of s.claims) {
    const c = e.outcome === "counted" ? byClaim.get(e.claimId) : undefined;
    if (!c) continue;
    let arr = places.get(e.eventDefId);
    if (!arr) places.set(e.eventDefId, (arr = []));
    arr.push(c.resultText.replace(/ place$/, ""));
  }
  return (
    <>
      <div className="chips">
        {props.seasons.map((x) => (
          <Link key={x} className={x === props.season ? "chip on" : "chip"} href={props.href(x)}>
            {seasonLabel(x)}
          </Link>
        ))}
      </div>
      <section className="card flush scroll">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th className="n">Estimate</th>
              <th className="n">Competitions</th>
              <th>Places</th>
              <th>Scope</th>
            </tr>
          </thead>
          <tbody>
            {s.events.map((e) => (
              <tr key={e.eventDefId}>
                <td>{e.name}</td>
                <td className="n">
                  <span className="pill">{usr(e.usr)}</span>
                </td>
                <td className="n">{e.competitions}</td>
                <td className="muted">{(places.get(e.eventDefId) ?? []).join(", ") || "-"}</td>
                <td className="muted">{e.comparable ? "National" : "Local only"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="muted" style={{ fontSize: 12 }}>
        Includes equivalent events from up to three earlier seasons, weighted less, as for team ratings.
      </p>
    </>
  );
}

function History({ snaps, seasons, label }: { snaps: Map<number, PersonalSnapshot>; seasons: number[]; label: string }) {
  const rated = seasons.filter((s) => snaps.get(s)!.state === "rated");
  if (!rated.length) return <p className="muted">No ratings yet.</p>;
  const chartSeasons = rated.filter((s) => s > rated[0] - 4);
  // One point per season, dated at the refit that season's estimate uses.
  const points = [...rated].reverse().map((s) => {
    const x = snaps.get(s)!;
    return { date: x.ratingAsOf ?? `${s}-06-01`, season: s, usr: x.summaryUsr!, trend: x.trendState === "rated" ? x.trendUsr : null, newResults: true };
  });
  return (
    <>
      <section className="card">
        <h2>
          {chartSeasons.length > 1
            ? `${seasonLabel(chartSeasons[chartSeasons.length - 1])} to ${seasonLabel(chartSeasons[0])}`
            : `${seasonLabel(chartSeasons[0])} season`}
        </h2>
        <RatingChart seasons={chartSeasons} label={label} points={points} />
      </section>
      <section className="card flush scroll">
        <table>
          <thead>
            <tr>
              <th>Season</th>
              <th className="n">USR</th>
              <th className="n">Season Trend</th>
              <th className="n">Events</th>
              <th className="n">Competitions</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rated.map((s) => {
              const x = snaps.get(s)!;
              return (
                <tr key={s}>
                  <td>{seasonLabel(s)}</td>
                  <td className="n">
                    <span className="pill">{usr(x.summaryUsr)}</span>
                  </td>
                  <td className="n">{x.trendState === "rated" ? usr(x.trendUsr) : "-"}</td>
                  <td className="n">{x.ratedEvents}</td>
                  <td className="n">{x.competitions}</td>
                  <td className="muted">{x.provisional ? "Provisional" : "Unofficial"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
