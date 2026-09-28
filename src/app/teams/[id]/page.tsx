import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RatingHistoryChart } from "@/components/charts";
import { FollowButton } from "@/components/client-bits";
import { Badge, Delta, EmptyState, Initials, Panel, Section, StatusBadge, btnGhostCls } from "@/components/ui";
import { fmtDate, fmtUsr, ordinal, seasonLabel, stateLabel } from "@/lib/format";
import { all, eventNames, kv, officialEvents } from "@/lib/queries/common";
import {
  correctionsFor,
  detailSnapshotId,
  eventBreakdown,
  history,
  teamAppearances,
  teamSeason,
} from "@/lib/queries/profiles";
import { WhyChanged } from "@/components/why-changed";
import { EventBreakdown, HistoryTable } from "@/components/profile";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/teams/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await teamSeason(decodeURIComponent(id));
  return { title: t ? `${t.schoolName} ${t.designation || "(unlabeled)"} · Div ${t.division} ${t.season}` : "Team" };
}

export default async function TeamPage(props: PageProps<"/teams/[id]">) {
  const { id: raw } = await props.params;
  const id = decodeURIComponent(raw);
  const t = await teamSeason(id);
  if (!t) notFound();
  const division = t.division!;
  const season = t.season!;
  const hist = await history("team", id, division, season);
  const rated = hist.filter((h) => h.usr !== null);
  const latest = rated.length ? rated[rated.length - 1] : null;
  const lastSnapshot = hist.length ? hist[hist.length - 1] : null;
  const detailId = detailSnapshotId(hist);
  const detailAsOf = hist.find((h) => h.snapshotId === detailId)?.asOf ?? null;
  const [apps, breakdown, official, names, siblings, otherSeasons, sourceRevision] = await Promise.all([
    teamAppearances(id, hist),
    eventBreakdown("team", id, division, season, detailId),
    officialEvents(division, season),
    eventNames(),
    all<{ id: string; d: string }>(
      `SELECT id, display_designation AS d FROM team_seasons WHERE school_id = ? AND division = ? AND season = ? AND id <> ? ORDER BY designation`,
      [t.schoolId, division, season, id],
    ),
    all<{ id: string; season: number; d: string }>(
      `SELECT id, season, display_designation AS d FROM team_seasons
       WHERE school_id = ? AND division = ? AND season <> ? AND designation = (SELECT designation FROM team_seasons WHERE id = ?) ORDER BY season DESC`,
      [t.schoolId, division, season, id],
    ),
    kv("source_revision"),
  ]);
  const M = official.length;
  const tournamentNames = new Map(apps.map((a) => [a.tournamentId, a.tournamentName]));
  const corrections = await correctionsFor(apps.map((a) => a.tournamentId));
  const label = t.designation ? t.designation : "Unlabeled team";
  const chartData = hist.map((h) => ({
    asOf: h.asOf,
    usr: h.usr,
    events: (h.explain?.t ?? []).map((tid) => tournamentNames.get(tid) ?? tid),
  }));

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link className="link" href="/rankings">
          Rankings
        </Link>{" "}
        /{" "}
        <Link className="link" href={`/schools/${t.schoolId}`}>
          {t.schoolName}
        </Link>{" "}
        / {label}
      </nav>

      <header className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_auto]">
        <div className="flex gap-4">
          <Initials name={t.schoolName} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t.schoolName} <span className="text-ink-2">· {label}</span>
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              {[t.city, stateLabel(t.state)].filter(Boolean).join(", ")} · Division {division} · {seasonLabel(season)} season · Team
              Performance
            </p>
            <p className="mt-1 max-w-2xl text-xs text-ink-3">
              Team designation “{label}” as it appears in tournament files{t.designation === "" ? " (entries with no suffix, when the school's only entry at that tournament)" : ""}.
              This rating reflects entries under this label, not a fixed group of students.
              {t.mappingNote ? ` Reviewed mapping: ${t.mappingNote}` : ""}
            </p>
            {siblings.length ? (
              <p className="mt-1 text-xs text-ink-3">
                Other {seasonLabel(season)} teams from this school:{" "}
                {siblings.map((s, i) => (
                  <span key={s.id}>
                    {i ? ", " : ""}
                    <Link className="link" href={`/teams/${s.id}`}>
                      {s.d || "Unlabeled"}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
            {otherSeasons.length ? (
              <p className="mt-1 text-xs text-ink-3">
                Same label in other seasons (separate team-seasons; rosters change):{" "}
                {otherSeasons.map((s, i) => (
                  <span key={s.id}>
                    {i ? ", " : ""}
                    <Link className="link" href={`/teams/${s.id}`}>
                      {seasonLabel(s.season)}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Link href={`/compare?view=team&div=${division}&season=${season}&ids=${encodeURIComponent(id)}`} className={btnGhostCls}>
            Compare
          </Link>
          <FollowButton item={{ id: `team:${id}`, href: `/teams/${id}`, label: `${t.schoolName} ${label} (${division} ${season})`, kind: "team" }} />
        </div>
      </header>

      <Panel className="mt-5 grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-3">USR · Team Performance</div>
          <div className="num text-5xl font-semibold tracking-tight text-ink">{fmtUsr(latest?.usr)}</div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={latest?.status ?? null} />
            {latest && latest.prevZ !== null ? (
              <span className="text-xs text-ink-3">
                last refit <Delta value={latest.usr! - (hist[hist.indexOf(latest) - 1]?.usr ?? latest.usr!)} />
              </span>
            ) : null}
          </div>
        </div>
        <Kv label="National rank (Div. " value={latest?.nationalRank ? `#${latest.nationalRank}` : "—"} sub={latest?.nationalRank ? `${stateLabel(t.state)} #${latest.stateRank}` : "Not established: no numbered rank"} labelSuffix={`${division})`} />
        <Kv label="Event coverage" value={latest ? `${latest.comparableEvents}/${M}` : "—"} sub="nationally comparable official events" />
        <Kv label="Eligible tournaments" value={latest?.tournaments ?? "—"} sub="in the rolling 400-day window" />
        <Kv label="Last competition" value={apps.length ? fmtDate(apps[apps.length - 1].endDate) : "—"} sub={lastSnapshot ? `latest refit ${fmtDate(lastSnapshot.asOf)}` : undefined} />
      </Panel>
      {latest?.status === "provisional" ? (
        <p className="mt-2 text-xs text-amber-ink">
          Provisional: this estimate is prior-assisted — official events without nationally comparable results count as the latent prior (USR
          10), which can bias sparse profiles. It has no numbered national rank.
        </p>
      ) : null}

      <Section
        id="history"
        title="Rating history"
        description={
          <>
            Weekly model refits (each Sunday) for this season, reconstructed from the current archive (source revision{" "}
            <span className="num">{(sourceRevision ?? "unknown").slice(0, 7)}</span>). This is
            not a record of what was displayed at the time. Blue guides mark refits that include a new result by this team. No rating is shown
            before the team&apos;s first eligible result; nothing is interpolated.
          </>
        }
      >
        {rated.length ? (
          <Panel className="p-3">
            <RatingHistoryChart data={chartData} label={`${t.schoolName} ${label}`} />
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-ink-2">Table view of rating history</summary>
              <HistoryTable hist={hist} tournamentNames={tournamentNames} />
            </details>
          </Panel>
        ) : (
          <EmptyState title="No rating yet">This team has no eligible official-event results in this season.</EmptyState>
        )}
      </Section>

      <WhyChanged hist={hist} eventNames={names} tournamentNames={tournamentNames} corrections={corrections} view="team" />

      <Section
        id="results"
        title="Tournament results"
        description="Official placements and total points exactly as published (penalties, drops, and ties preserved). Rating before/after refer to the weekly refits immediately before the start date and on or after the end date; other results in the same week also affect the after value."
      >
        {apps.length ? (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tournament</th>
                  <th className="r">Place</th>
                  <th className="r">Points</th>
                  <th className="r">Before</th>
                  <th className="r">After</th>
                  <th className="r">Change</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {[...apps].reverse().map((a) => (
                  <tr key={a.entryId}>
                    <td className="num whitespace-nowrap">{fmtDate(a.endDate)}</td>
                    <td className="min-w-[14rem]">
                      <Link href={`/tournaments/${a.tournamentId}`} className="link">
                        {a.tournamentName}
                      </Link>
                      <div className="text-xs text-ink-3">
                        {a.level} · team #{a.number}
                        {a.track ? ` · ${a.track}${a.trackRank ? ` (${ordinal(a.trackRank)} in track)` : ""}` : ""}
                        {a.exhibition ? " · exhibition" : ""}
                        {a.penaltyPoints ? ` · ${a.penaltyPoints} penalty pts` : ""}
                        {!a.ratingEligible ? ` · not rated: ${a.exclusionReason}` : ""}
                      </div>
                    </td>
                    <td className="r num whitespace-nowrap">
                      {a.rank ? ordinal(a.rank) : "—"}
                      <span className="text-ink-3"> / {a.fieldSize}</span>
                    </td>
                    <td className="r num">{a.points ?? "—"}</td>
                    <td className="r num">{fmtUsr(a.before?.usr)}</td>
                    <td className="r num">{fmtUsr(a.after?.usr)}</td>
                    <td className="r">
                      {a.after?.usr !== undefined && a.after?.usr !== null ? (
                        a.before?.usr !== undefined && a.before?.usr !== null ? (
                          <Delta value={a.after.usr - a.before.usr} />
                        ) : (
                          <Badge tone="cobalt" title="First rating: an initial estimate from this team's first results, not a change">
                            initial
                          </Badge>
                        )
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td>
                      <a href={a.resultUrl} className="link text-xs">
                        Duosmium
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No appearances" />
        )}
      </Section>

      <Section
        id="events"
        title="Event ratings and results"
        description={
          <>
            Each official event is rated independently{detailAsOf ? ` (event detail stored at the ${fmtDate(detailAsOf)} refit)` : ""}. Model rank is
            this team&apos;s rank among eligible participants in that event (midranks for ties; no-shows, participation-only, disqualified, and
            exhibition results excluded); n is that event&apos;s eligible field. Evidence labels are heuristics, not confidence intervals.
          </>
        }
      >
        <EventBreakdown rows={breakdown} />
      </Section>
    </div>
  );
}

function Kv({ label, value, sub, labelSuffix }: { label: string; value: React.ReactNode; sub?: string; labelSuffix?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">
        {label}
        {labelSuffix ?? ""}
      </div>
      <div className="num mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-ink-3">{sub}</div> : null}
    </div>
  );
}

