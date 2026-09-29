import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RatingBadge, seasonLabel, seasonRange, Tabs, teamLabel, usr } from "@/components/plain";
import { ChipRow, EventTable, ProfileHeader, ResultCard, SeasonHead } from "@/components/profile";
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

  return (
    <>
      <ProfileHeader
        avatar={t.schoolName}
        title={name}
        sub={
          <>
            <Link href={`/schools/${t.schoolId}`}>{t.schoolName}</Link> · {[t.city, t.state].filter(Boolean).join(", ")} · Division {division} ·{" "}
            {seasonRange(t.firstSeason!, t.season!)}
          </>
        }
        badges={
          <>
            <RatingBadge label="USR" value={latest?.usr} coverage={latest && M ? latest.comparableEvents! / M : undefined} sub={status} />
            <RatingBadge label="SEASON TREND" value={latest?.trendUsr} sub={latest ? seasonLabel(latest.season) : undefined} trend />
          </>
        }
        stats={[
          { value: latest?.nationalRank ? `#${latest.nationalRank}` : "-", label: "National" },
          { value: latest?.stateRank ? `#${latest.stateRank}` : "-", label: t.state },
          { value: `${latest?.comparableEvents ?? 0}/${M}`, label: "Events" },
          { value: apps.length, label: "Tournaments" },
          { value: seasons.length, label: "Seasons" },
        ]}
      />

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
            <SeasonHead season={s} />
            {apps
              .filter((a) => a.season === s)
              .reverse()
              .map((a) => (
                <ResultCard
                  key={a.entryId}
                  url={a.resultUrl}
                  name={a.tournamentName}
                  meta={`${a.endDate} · ${a.level}`}
                  stats={[
                    { value: a.rank ? `${a.rank}` : "-", label: `of ${a.fieldSize}` },
                    { value: a.points ?? "-", label: "points" },
                    { value: `${usr(a.before?.usr)} → ${usr(a.after?.usr)}`, label: "USR" },
                  ]}
                />
              ))}
          </div>
        ))
      ) : tab === "events" ? (
        <>
          <ChipRow items={seasons.map((s) => ({ key: s, label: seasonLabel(s), href: `${base}?season=${s}&tab=events`, on: s === season }))} />
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
      ) : (
        <RatingHistory hist={hist} names={names} label={name} more={Number(sp.more) || 0} moreHref={(n) => `${base}?tab=history&more=${n}`} />
      )}
    </>
  );
}
