import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerifiedIcon } from "@/components/account";
import { RatingBadge, seasonLabel, seasonRange, Tabs } from "@/components/plain";
import { ChipRow, EventTable, ProfileHeader, ResultCard, SeasonHead } from "@/components/profile";
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

/** Member profile, laid out exactly like a team profile: Results / Events / Rating History. */
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
  const seasons = [...new Set(claims.map((c) => c.claim.season))].sort((a, b) => b - a);
  const ratedSeasons = [...snaps.keys()].sort((a, b) => b - a);
  const latest = ratedSeasons.length ? snaps.get(ratedSeasons[0])! : null;
  const season = ratedSeasons.includes(Number(sp.season)) ? Number(sp.season) : ratedSeasons[0];
  const memberSeasons = memberships.map((m) => m.season);
  const currentSchool = memberships[0];
  const base = `/members/${encodeURIComponent(p.userId)}`;
  const q = (extra: string) => {
    const parts = [division !== latestDivision ? `div=${division}` : "", extra].filter(Boolean);
    return parts.length ? `${base}?${parts.join("&")}` : base;
  };
  const rated = latest?.state === "rated";
  const status = !latest ? "Unrated" : !rated ? "No comparable estimate" : latest.provisional ? "Provisional" : "Unofficial";

  return (
    <>
      {p.isPrivate ? (
        <p className="flash ok" role="status">
          Your profile is private: only you can see this page. <Link href="/settings/profile">Change in Settings</Link>
        </p>
      ) : null}
      <ProfileHeader
        avatar={p.displayName}
        title={p.displayName}
        sub={
          <>
            {currentSchool ? (
              <>
                <Link href={`/schools/${encodeURIComponent(currentSchool.school_id)}?tab=members`}>{currentSchool.school_name}</Link>
                <VerifiedIcon verified={currentSchool.status === "VERIFIED"} /> ·{" "}
              </>
            ) : null}
            Division {division}
            {memberSeasons.length ? ` · ${seasonRange(Math.min(...memberSeasons), Math.max(...memberSeasons))}` : ""}
          </>
        }
        chips={
          divisions.length > 1
            ? divisions.map((d) => (
                <Link key={d} className={d === division ? "chip on" : "chip"} href={d === latestDivision ? base : `${base}?div=${d}`}>
                  Division {d}
                </Link>
              ))
            : undefined
        }
        badges={
          <>
            <RatingBadge label="UNOFFICIAL USR" value={rated ? latest!.summaryUsr : null} sub={status} />
            <RatingBadge
              label="SEASON TREND"
              value={latest?.trendState === "rated" ? latest.trendUsr : null}
              sub={ratedSeasons.length ? seasonLabel(ratedSeasons[0]) : undefined}
              trend
            />
          </>
        }
        stats={[
          { value: latest?.ratedEvents ?? 0, label: "Events" },
          { value: new Set(claims.map((c) => c.claim.tournament_id)).size, label: "Tournaments" },
          { value: seasons.length, label: "Seasons" },
          { value: `${claims.filter(isVerified).length}/${claims.length}`, label: "Verified" },
        ]}
        note={`Estimated from ${own ? "your" : "their"} claimed team-event results. It does not isolate ${own ? "your" : "their"} individual contribution.`}
      />

      <Tabs
        active={tab}
        items={[
          { key: "results", label: "Results", href: q("") },
          { key: "events", label: "Events", href: q("tab=events") },
          { key: "history", label: "Rating History", href: q("tab=history") },
        ]}
      />

      {tab === "results" ? (
        <Results claims={claims} seasons={seasons} schools={memberships} />
      ) : tab === "events" ? (
        <Events snaps={snaps} seasons={ratedSeasons} season={season} claims={claims} href={(s) => q(`season=${s}&tab=events`)} />
      ) : (
        <History snaps={snaps} seasons={ratedSeasons} label={p.displayName} />
      )}
    </>
  );
}

function Results({ claims, seasons, schools }: { claims: DashClaim[]; seasons: number[]; schools: { school_name: string; season: number }[] }) {
  if (!claims.length) return <p className="muted">No claimed tournaments yet.</p>;
  return (
    <>
      {seasons.map((s) => {
        const groups = new Map<string, DashClaim[]>();
        for (const c of claims.filter((x) => x.claim.season === s)) {
          const k = `${c.claim.tournament_id}|${c.claim.entry_id}`;
          let arr = groups.get(k);
          if (!arr) groups.set(k, (arr = []));
          arr.push(c);
        }
        return (
          <div key={s}>
            <SeasonHead season={s} extra={schools.find((x) => x.season === s)?.school_name} />
            {[...groups.values()]
              .sort((a, b) => b[0].tournamentDate.localeCompare(a[0].tournamentDate))
              .map((g) => {
                const first = g[0];
                return (
                  <ResultCard
                    key={`${first.claim.tournament_id}|${first.claim.entry_id}`}
                    url={first.resultUrl}
                    name={first.tournamentName}
                    meta={`${first.tournamentDate}${first.tournamentLevel ? ` · ${first.tournamentLevel}` : ""} · ${first.entryText}`}
                    stats={[
                      { value: g.length, label: g.length === 1 ? "event" : "events" },
                      { value: `${g.filter(isVerified).length}/${g.length}`, label: "verified" },
                    ]}
                  >
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
                  </ResultCard>
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
      <ChipRow items={props.seasons.map((x) => ({ key: x, label: seasonLabel(x), href: props.href(x), on: x === props.season }))} />
      <EventTable
        midLabel="Scope"
        rows={s.events.map((e) => ({
          key: e.eventDefId,
          name: e.name,
          usr: e.usr,
          mid: e.comparable ? "National" : "Local",
          places: (places.get(e.eventDefId) ?? []).join(", "),
        }))}
      />
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
              <th className="n">Tournaments</th>
            </tr>
          </thead>
          <tbody>
            {rated.map((s) => {
              const x = snaps.get(s)!;
              return (
                <tr key={s}>
                  <td>{seasonLabel(s)}</td>
                  <td className="n">
                    <span className="pill">{x.summaryUsr?.toFixed(2)}</span>
                  </td>
                  <td className="n">{x.trendState === "rated" ? x.trendUsr?.toFixed(2) : "-"}</td>
                  <td className="n">{x.ratedEvents}</td>
                  <td className="n">{x.competitions}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
