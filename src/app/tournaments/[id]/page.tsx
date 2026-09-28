import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Panel, Section, Stat } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtUsr, ordinal, seasonLabel, stateLabel, STATUS_TEXT } from "@/lib/format";
import { tournamentDetail } from "@/lib/queries/tournaments";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/tournaments/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const d = tournamentDetail(decodeURIComponent(id));
  return { title: d ? String(d.t.name) : "Tournament" };
}

export default async function TournamentPage(props: PageProps<"/tournaments/[id]">) {
  const { id: raw } = await props.params;
  const id = decodeURIComponent(raw);
  const d = tournamentDetail(id);
  if (!d) notFound();
  const { t, source, events, entries, results, strength, k, penalties } = d;
  const res = new Map(results.map((r) => [`${r.entry_id}|${r.tournament_event_id}`, r]));
  const pen = new Map<string, number>();
  for (const p of penalties) pen.set(p.entry_id, (pen.get(p.entry_id) ?? 0) + p.points);
  const team = strength.find((s) => s.view === "team");
  const school = strength.find((s) => s.view === "school");
  const official = events.filter((e) => e.model_eligible);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link className="link" href="/tournaments">
          Tournaments
        </Link>{" "}
        / {String(t.short_name ?? t.name)}
      </nav>
      <header className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{String(t.name)}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {fmtDate(String(t.start_date))}
          {t.end_date !== t.start_date ? `–${fmtDate(String(t.end_date))}` : ""} · {String(t.location ?? "")}
          {t.state ? `, ${stateLabel(String(t.state))}` : ""} · {String(t.level)} · Division {String(t.division)} · {seasonLabel(Number(t.season))} season
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {t.rating_eligible ? <Badge tone="lime">Included in ratings</Badge> : <Badge tone="amber">Not rated: {String(t.exclusion_reason)}</Badge>}
          <Badge title="Format is only recorded when explicitly established; unknown formats get weight 1">
            Format: {String(t.format)}
            {t.format_basis ? ` (${String(t.format_basis)})` : ""}
          </Badge>
          {Number(t.worst_placings_dropped) ? <Badge>{String(t.worst_placings_dropped)} worst placings dropped</Badge> : null}
          {t.has_tracks ? <Badge>Tracks: {d.tracks.map((x) => String(x.name)).join(", ")}</Badge> : null}
          {t.reverse_scoring ? <Badge>Reverse scoring</Badge> : null}
        </div>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="p-4">
          <h2 className="text-sm font-semibold">Source & import</h2>
          <dl className="mt-2 grid gap-1 text-sm">
            <div>
              Results sourced from{" "}
              <a className="link" href={String(t.result_url)}>
                Duosmium
              </a>
            </div>
            <div className="text-ink-3">
              File <span className="num">{String(source?.path ?? "")}</span>
            </div>
            <div className="text-ink-3">
              Revision <span className="num">{String(source?.source_revision ?? "unknown").slice(0, 10)}</span> · fetched {fmtDateTime(String(source?.fetched_at ?? ""))}
            </div>
            <div className="text-ink-3">
              SHA-256 <span className="num">{String(t.content_hash).slice(0, 16)}…</span> · parser {String(source?.parser_version ?? "")}
            </div>
            <div className="text-ink-3">Import status: {String(source?.status ?? "imported")}</div>
            {source?.reason ? <div className="text-xs text-amber-ink">{String(source.reason)}</div> : null}
            {d.changes.length > 1 ? (
              <div className="text-xs text-ink-3">
                {d.changes.length} import events recorded (latest: {String(d.changes[0].change)} {fmtDate(String(d.changes[0].started_at))})
              </div>
            ) : null}
          </dl>
        </Panel>
        <Panel className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Pre-tournament field strength</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            From the last weekly refit strictly before the start date{team?.pre_snapshot_as_of ? ` (${team.pre_snapshot_as_of})` : ""}; no results from this
            tournament or later are used. Coverage shows how many entrants already had an established rating.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Team Perf. mean" value={team?.mean_usr ? fmtUsr(team.mean_usr) : "—"} sub={team?.mean_usr ? "established entrants" : "Insufficient evidence"} />
            <Stat label="Top-5 mean" value={team?.top5_mean_usr ? fmtUsr(team.top5_mean_usr) : "—"} sub="Team Performance" />
            <Stat label="Coverage" value={team ? `${team.established}/${team.entries}` : "—"} sub={team ? `${team.rated} with any rating` : undefined} />
            <Stat label="School Potential mean" value={school?.mean_usr ? fmtUsr(school.mean_usr) : "—"} sub={school ? `${school.established}/${school.entries} schools established` : undefined} />
          </div>
        </Panel>
      </div>

      <Section
        id="standings"
        title="Official standings"
        description="Ranks and total points exactly as computed by the official SciolyFF interpreter (drops, penalties, exhibition handling, and tie-breaks preserved)."
      >
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <thead>
              <tr>
                <th className="r">Rank</th>
                <th>Team</th>
                <th className="hidden sm:table-cell">State</th>
                <th className="r">Points</th>
                {t.has_tracks ? <th className="hidden md:table-cell">Track</th> : null}
                <th className="hidden md:table-cell">Identity</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={String(e.id)}>
                  <td className="r num font-medium">{e.rank ? ordinal(Number(e.rank)) : "—"}</td>
                  <td className="min-w-[14rem]">
                    <Link className="link" href={`/schools/${e.school_id}`}>
                      {String(e.school_name)}
                    </Link>{" "}
                    {e.team_season_id ? (
                      <Link className="text-ink-2 hover:underline" href={`/teams/${e.team_season_id}`}>
                        {String(e.raw_suffix ?? "") || "(unlabeled)"}
                      </Link>
                    ) : (
                      <span className="text-ink-2">{String(e.raw_suffix ?? "")}</span>
                    )}
                    <span className="ml-1 text-xs text-ink-3">#{String(e.number)}</span>
                    {e.exhibition ? <Badge>Exhibition</Badge> : null}
                    {e.disqualified ? <Badge tone="red">Disqualified</Badge> : null}
                    {e.withdrawn ? <Badge>Withdrawn</Badge> : null}
                  </td>
                  <td className="hidden sm:table-cell">{stateLabel(String(e.school_state))}</td>
                  <td className="r num">
                    {e.points === null || e.points === undefined ? "—" : String(e.points)}
                    {pen.get(String(e.id)) ? <span className="text-xs text-red-ink"> (+{pen.get(String(e.id))} pen.)</span> : null}
                  </td>
                  {t.has_tracks ? (
                    <td className="hidden text-ink-2 md:table-cell">
                      {String(e.track ?? "")}
                      {e.track_rank ? ` · ${ordinal(Number(e.track_rank))}` : ""}
                    </td>
                  ) : null}
                  <td className="hidden md:table-cell">
                    {e.resolution === "unresolved" ? (
                      <Badge tone="amber" title={String(e.resolution_reason)}>
                        Unresolved
                      </Badge>
                    ) : (
                      <span className="text-xs text-ink-3">resolved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="matrix"
        title="Event placements"
        description={
          <>
            Official event places. <span className="num">NS</span> no-show, <span className="num">PO</span> participation only,{" "}
            <span className="num">DQ</span> disqualified, <span className="num">?</span> unknown; grey = dropped score; <i>T</i> = trial event;{" "}
            <i>ex</i> = exempt. Scroll horizontally for all events.
          </>
        }
      >
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface">Team</th>
                {events.map((e) => (
                  <th key={e.id} className="r align-bottom" title={e.model_note ?? (e.model_eligible ? "Rated event" : "Not rated")}>
                    <span className="block max-w-[5.5rem] whitespace-normal normal-case">{e.name}</span>
                    {e.trial || e.trialed ? <i className="font-normal">T</i> : null}
                    {!e.model_eligible ? <span className="block font-normal normal-case text-ink-3">not rated</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={String(e.id)}>
                  <td className="sticky left-0 z-10 bg-surface whitespace-nowrap">
                    <span className="num text-ink-3">{e.rank ? `${e.rank}. ` : ""}</span>
                    {String(e.school_name).slice(0, 28)} {String(e.raw_suffix ?? "")}
                  </td>
                  {events.map((ev) => {
                    const r = res.get(`${e.id}|${ev.id}`);
                    if (!r) return <td key={ev.id} className="r text-ink-3">·</td>;
                    const txt = r.status === "placed" ? String(r.place) : STATUS_TEXT[r.status] || r.status;
                    return (
                      <td key={ev.id} className={`r num ${r.dropped ? "text-ink-3 line-through" : ""}`}>
                        {txt}
                        {r.tie ? "*" : ""}
                        {r.exempt ? <i> ex</i> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-ink-3">* tie in the official results.</p>
      </Section>

      {k.size ? (
        <Section
          id="field"
          title="Retrospective event field strength"
          description={`Post-hoc field offsets k from the ${d.kSnapshot} refit (Team Performance). Positive k = stronger field than average. This is a retrospective estimate that uses results after this tournament; it is not the pre-tournament field strength above.`}
        >
          <div className="flex flex-wrap gap-2">
            {official.map((e) =>
              k.has(e.id) ? (
                <span key={e.id} className="rounded border border-line bg-surface px-2 py-1 text-xs">
                  {e.name} <span className="num font-medium">{k.get(e.id)! >= 0 ? "+" : "−"}{Math.abs(k.get(e.id)!).toFixed(2)}</span>
                </span>
              ) : null,
            )}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
