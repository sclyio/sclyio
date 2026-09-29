import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar, RatingBadge, seasonLabel, seasonRange, Tabs, teamLabel, TournamentLink, usr } from "@/components/plain";
import { RatingHistory } from "@/components/rating-history";
import { STATUS_TEXT } from "@/lib/format";
import { officialEvents } from "@/lib/queries/common";
import { detailSnapshotId, eventBreakdown, team, teamAppearances, teamHistory } from "@/lib/queries/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/teams/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await team(decodeURIComponent(id));
  return { title: t ? `${t.schoolName} ${teamLabel(t.designation)}`.trim() : "Team" };
}

export default async function TeamPage(props: PageProps<"/teams/[id]">) {
  const { id: raw } = await props.params;
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const tab = sp.tab === "events" || sp.tab === "history" ? sp.tab : "results";
  const id = decodeURIComponent(raw);
  const t = await team(id);
  if (!t) notFound();
  const division = t.division!;
  const hist = await teamHistory(id, division);
  const apps = await teamAppearances(id, hist);
  const seasons = [...new Set(apps.map((a) => a.season))].sort((a, b) => b - a);
  const season = seasons.includes(Number(sp.season)) ? Number(sp.season) : t.season!;
  const seasonHist = hist.filter((h) => h.season === season);
  const latest = hist.length ? hist[hist.length - 1] : null;
  const [events, official] = await Promise.all([
    tab === "events" ? eventBreakdown("team", id, division, season, detailSnapshotId(seasonHist)) : Promise.resolve([]),
    officialEvents(division, latest?.season ?? season),
  ]);
  const names = new Map(apps.map((a) => [a.tournamentId, a.tournamentName]));
  const M = official.length;
  const base = `/teams/${encodeURIComponent(id)}`;
  const withSeason = (extra: string) => `${base}?${season !== t.season ? `season=${season}&` : ""}${extra}`;
  const name = `${t.schoolName} ${teamLabel(t.designation)}`.trim();
  const status = latest?.status === "established" ? "Ranked" : latest?.status ? latest.status[0].toUpperCase() + latest.status.slice(1) : "Unrated";

  const seasonChips = (tabKey: string) => (
    <div className="chips">
      {seasons.map((s) => (
        <Link key={s} className={s === season ? "chip on" : "chip"} href={`${base}?season=${s}${tabKey ? `&tab=${tabKey}` : ""}`}>
          {seasonLabel(s)}
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <section className="card">
        <div className="profile">
          <Avatar name={t.schoolName} />
          <div>
            <h1 className="profile-name">{name}</h1>
            <div className="profile-sub">
              <Link href={`/schools/${t.schoolId}`}>{t.schoolName}</Link> · {[t.city, t.state].filter(Boolean).join(", ")} · Division {division} ·{" "}
              {seasonRange(t.firstSeason!, t.season!)}
            </div>
          </div>
          <div className="badges">
            <RatingBadge label="USR" value={latest?.usr} coverage={latest && M ? latest.comparableEvents! / M : undefined} sub={status} />
            <RatingBadge label="SEASON TREND" value={latest?.trendUsr} sub={latest ? seasonLabel(latest.season) : undefined} trend />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <span className="stat">
            <b>{latest?.nationalRank ? `#${latest.nationalRank}` : "-"}</b>
            <span>National</span>
          </span>
          <span className="stat">
            <b>{latest?.stateRank ? `#${latest.stateRank}` : "-"}</b>
            <span>{t.state}</span>
          </span>
          <span className="stat">
            <b>
              {latest?.comparableEvents ?? 0}/{M}
            </b>
            <span>Events</span>
          </span>
          <span className="stat">
            <b>{apps.length}</b>
            <span>Tournaments</span>
          </span>
          <span className="stat">
            <b>{seasons.length}</b>
            <span>Seasons</span>
          </span>
        </div>
      </section>

      <Tabs
        active={tab}
        items={[
          { key: "results", label: "Results", href: base },
          { key: "events", label: "Events", href: withSeason("tab=events") },
          { key: "history", label: "Rating History", href: withSeason("tab=history") },
        ]}
      />

      {tab === "results" ? (
        seasons.map((s) => (
          <div key={s}>
            <h2 className="season-head">{seasonLabel(s)}</h2>
            {apps
              .filter((a) => a.season === s)
              .reverse()
              .map((a) => (
                <section key={a.entryId} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <TournamentLink url={a.resultUrl} name={a.tournamentName} bold />
                      <div className="muted">
                        {a.endDate} · {a.level}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                      <span className="stat" style={{ margin: 0 }}>
                        <b>{a.rank ? `${a.rank}` : "-"}</b>
                        <span>of {a.fieldSize}</span>
                      </span>
                      <span className="stat" style={{ margin: 0 }}>
                        <b>{a.points ?? "-"}</b>
                        <span>points</span>
                      </span>
                      <span className="stat" style={{ margin: 0 }}>
                        <b>
                          {usr(a.before?.usr)} → {usr(a.after?.usr)}
                        </b>
                        <span>USR</span>
                      </span>
                    </div>
                  </div>
                </section>
              ))}
          </div>
        ))
      ) : tab === "events" ? (
        <>
          {seasonChips("events")}
          <section className="card flush scroll">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th className="n">USR</th>
                  <th className="n">Rank</th>
                  <th>Places</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .filter((e) => !e.eventDefId.startsWith("other:"))
                  .map((e) => (
                    <tr key={e.eventDefId}>
                      <td>{e.name}</td>
                      <td className="n">
                        <span className="pill">{usr(e.rating?.usr)}</span>
                      </td>
                      <td className="n muted">{e.rating?.eventRank ? `#${e.rating.eventRank} of ${e.rankedCount}` : "-"}</td>
                      <td className="muted">
                        {e.results.map((r) => (r.status === "placed" ? r.place : STATUS_TEXT[r.status] || r.status)).join(", ") || "-"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <RatingHistory hist={hist} names={names} label={name} more={Number(sp.more) || 0} moreHref={(n) => `${base}?tab=history&more=${n}`} />
      )}
    </>
  );
}
