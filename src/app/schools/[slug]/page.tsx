import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { VerifiedIcon } from "@/components/account";
import { RatingBadge, seasonLabel, seasonRange, Tabs, teamLabel, usr } from "@/components/plain";
import { ChipRow, EventTable, ProfileHeader, ResultCard, SeasonHead } from "@/components/profile";
import { RatingHistory } from "@/components/rating-history";
import { accountsDb, ensureAccountsSchema } from "@/lib/accounts/db";
import { schoolMembers, type SchoolMember } from "@/lib/accounts/public";
import { STATUS_TEXT } from "@/lib/format";
import { entityLabel, officialEvents } from "@/lib/queries/common";
import { attachRefits, detailSnapshotId, eventBreakdown, schoolHistory, schoolProfile } from "@/lib/queries/profiles";

export const dynamic = "force-dynamic";

const TABS = ["teams", "results", "events", "history", "members"] as const;

export async function generateMetadata(props: PageProps<"/schools/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await entityLabel("school", decodeURIComponent(slug));
  return { title: s ? s.schoolName : "School" };
}

/** School profile, laid out exactly like a team profile, one division at a time. */
export default async function SchoolPage(props: PageProps<"/schools/[slug]">) {
  const { slug } = await props.params;
  const id = decodeURIComponent(slug);
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "teams";
  const p = await schoolProfile(id);
  if (!p) notFound();

  const divisions = [...new Set(p.potential.map((x) => x.division))].sort().reverse();
  const latestDivision = p.potential[0]?.division ?? divisions[0] ?? "C";
  const division = divisions.includes(sp.div ?? "") ? sp.div! : latestDivision;
  const hist = await schoolHistory(id, division);
  const latest = hist.length ? hist[hist.length - 1] : null;
  const apps = p.appearances.filter((a) => a.division === division);
  const seasons = [...new Set(apps.map((a) => Number(a.season)))].sort((a, b) => b - a);
  const ratedSeasons = [...new Set(hist.map((h) => h.season))].sort((a, b) => b - a);
  const season = ratedSeasons.includes(Number(sp.season)) ? Number(sp.season) : (latest?.season ?? seasons[0]);
  const [events, official, members] = await Promise.all([
    tab === "events" && season ? eventBreakdown("school", id, division, season, detailSnapshotId(hist.filter((h) => h.season === season))) : Promise.resolve([]),
    officialEvents(division, latest?.season ?? season ?? 0),
    tab === "members" ? ensureAccountsSchema().then(() => schoolMembers(accountsDb(), id)).catch(() => null) : Promise.resolve(null),
  ]);
  const M = official.length;
  const teams = p.teams.filter((t) => t.division === division);
  const results = attachRefits(
    apps.map((a) => ({
      id: String(a.id),
      name: String(a.name),
      level: String(a.level),
      season: Number(a.season),
      startDate: String(a.start_date),
      endDate: String(a.end_date),
      url: String(a.result_url),
      entries: Number(a.entries),
      bestRank: a.best_rank === null ? null : Number(a.best_rank),
      field: Number(a.field),
    })),
    hist,
  );
  const names = new Map(results.map((r) => [r.id, r.name]));
  const base = `/schools/${encodeURIComponent(id)}`;
  const q = (extra: string) => {
    const parts = [division !== latestDivision ? `div=${division}` : "", extra].filter(Boolean);
    return parts.length ? `${base}?${parts.join("&")}` : base;
  };
  const status = latest?.status === "established" ? "Ranked" : latest?.status ? latest.status[0].toUpperCase() + latest.status.slice(1) : "Unrated";

  return (
    <>
      <ProfileHeader
        avatar={p.school.schoolName}
        title={p.school.schoolName}
        sub={
          <>
            {[p.school.city, p.school.state].filter(Boolean).join(", ")} · Division {division}
            {seasons.length ? ` · ${seasonRange(seasons[seasons.length - 1], seasons[0])}` : ""}
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
            <RatingBadge label="USR" value={latest?.usr} coverage={latest && M ? latest.comparableEvents! / M : undefined} sub={status} />
            <RatingBadge label="SEASON TREND" value={latest?.trendUsr} sub={latest ? seasonLabel(latest.season) : undefined} trend />
          </>
        }
        stats={[
          { value: latest?.nationalRank ? `#${latest.nationalRank}` : "-", label: "National" },
          { value: latest?.stateRank ? `#${latest.stateRank}` : "-", label: p.school.state },
          { value: `${latest?.comparableEvents ?? 0}/${M}`, label: "Events" },
          { value: apps.length, label: "Tournaments" },
          { value: seasons.length, label: "Seasons" },
        ]}
      />

      <Tabs
        active={tab}
        items={[
          { key: "teams", label: "Teams", href: q("") },
          { key: "results", label: "Results", href: q("tab=results") },
          { key: "events", label: "Events", href: q("tab=events") },
          { key: "history", label: "Rating History", href: q("tab=history") },
          { key: "members", label: "Members", href: q("tab=members") },
        ]}
      />

      {tab === "teams" ? (
        <section className="card flush">
          <ul className="rows">
            {teams.map((t) => (
              <li key={t.id} className="row">
                <span className="who">
                  <Link href={`/teams/${t.id}`}>
                    {p.school.schoolName} {teamLabel(t.designation)}
                  </Link>
                  <div className="sub">
                    {seasonRange(t.first_season, t.season)} · {t.appearances} tournaments
                    {t.rating?.national_rank ? ` · #${t.rating.national_rank}` : ""}
                  </div>
                </span>
                <span className="pill">{usr(t.rating?.usr)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : tab === "results" ? (
        seasons.map((s) => (
          <div key={s}>
            <SeasonHead season={s} />
            {results
              .filter((r) => r.season === s)
              .map((r) => (
                <ResultCard
                  key={r.id}
                  url={r.url}
                  name={r.name}
                  meta={`${r.endDate} · ${r.level}`}
                  stats={[
                    { value: r.bestRank ?? "-", label: `best of ${r.field}` },
                    { value: r.entries, label: r.entries === 1 ? "team" : "teams" },
                    { value: `${usr(r.before?.usr)} → ${usr(r.after?.usr)}`, label: "USR" },
                  ]}
                />
              ))}
          </div>
        ))
      ) : tab === "events" ? (
        <>
          <ChipRow items={ratedSeasons.map((s) => ({ key: s, label: seasonLabel(s), href: q(`season=${s}&tab=events`), on: s === season }))} />
          <EventTable
            rows={events
              .filter((e) => !e.eventDefId.startsWith("other:"))
              .map((e) => ({
                key: e.eventDefId,
                name: e.name,
                usr: e.rating?.usr,
                mid: e.rating?.eventRank ? `#${e.rating.eventRank} of ${e.rankedCount}` : "-",
                places: e.results.map((r) => (r.status === "placed" ? r.place : STATUS_TEXT[r.status] || r.status)).join(", "),
              }))}
          />
        </>
      ) : tab === "history" ? (
        <RatingHistory hist={hist} names={names} label={`${p.school.schoolName} Division ${division}`} more={Number(sp.more) || 0} moreHref={(n) => q(`tab=history&more=${n}`)} />
      ) : (
        <Members members={members} division={division} />
      )}
    </>
  );
}

function Members({ members, division }: { members: { members: SchoolMember[]; privateCount: number } | null; division: string }) {
  if (!members) return <p className="muted">Members are temporarily unavailable.</p>;
  const list = members.members.filter((m) => m.division === division);
  const seasons = [...new Set(list.map((m) => m.season))].sort((a, b) => b - a);
  return (
    <>
      <p className="muted" style={{ fontSize: 13 }}>
        <VerifiedIcon verified /> verified · <VerifiedIcon verified={false} /> self-reported
      </p>
      {seasons.length === 0 ? <p className="muted">No public members yet.</p> : null}
      {seasons.map((s) => (
        <div key={s}>
          <SeasonHead season={s} />
          <section className="card flush">
            <ul className="rows">
              {list
                .filter((m) => m.season === s)
                .map((m) => (
                  <li key={m.userId} className="row">
                    <span className="who">
                      <Link href={`/members/${m.userId}`}>{m.displayName}</Link>
                      <VerifiedIcon verified={m.verified} />
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      ))}
      {members.privateCount ? (
        <p className="muted" style={{ fontSize: 13 }}>
          {members.privateCount} more member{members.privateCount === 1 ? " has" : "s have"} a private profile.
        </p>
      ) : null}
    </>
  );
}
