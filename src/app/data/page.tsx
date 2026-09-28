import Link from "next/link";
import type { Metadata } from "next";
import { CorrectionDownload } from "@/components/client-bits";
import { Badge, Panel, Section } from "@/components/ui";
import { fmtDate, fmtDateTime, seasonLabel } from "@/lib/format";
import { coverage, dataQuality } from "@/lib/queries/coverage";
import { PARSER_VERSION } from "@/lib/rating/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data coverage" };

export default async function DataPage() {
  const [cov, dq] = await Promise.all([coverage(), dataQuality()]);
  const params = JSON.parse(String(dq.build.params)) as Record<string, number | string>;
  const files = Object.fromEntries(cov.files.map((f) => [f.status, f.c]));
  const correctionsUrl = process.env.CORRECTIONS_URL;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Data coverage</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-3">
        What is and is not in scly.io, where it comes from, and how to report a problem. Everything on this page is read from the database built by
        the import and rating jobs.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Panel className="p-4 text-sm">
          <h2 className="font-semibold">Source</h2>
          <p className="mt-1">
            Tournament results from{" "}
            <a className="link" href="https://www.duosmium.org/results/">
              Duosmium Results
            </a>
            , read as SciolyFF files from the public{" "}
            <a className="link" href="https://github.com/Duosmium/duosmium/tree/main/data/results">
              Duosmium/duosmium repository
            </a>{" "}
            (MIT License, © Duosmium contributors) and scored with the official{" "}
            <a className="link" href="https://github.com/Duosmium/sciolyff-js">
              sciolyff
            </a>{" "}
            interpreter. No results HTML is scraped.
          </p>
          <dl className="mt-2 grid gap-0.5 text-ink-2">
            <div>
              Adapter: <span className="num">{cov.adapter}</span> · parser <span className="num">{PARSER_VERSION}</span>
            </div>
            <div>
              Source revision: <span className="num break-all">{cov.sourceRevision}</span>
            </div>
            <div>Last successful sync: {fmtDateTime(cov.lastSync)}</div>
            <div>Last rating build: {fmtDateTime(cov.lastBuild)}</div>
          </dl>
        </Panel>
        <Panel className="p-4 text-sm">
          <h2 className="font-semibold">Files</h2>
          <dl className="mt-1 grid grid-cols-2 gap-1">
            <dt>Imported</dt>
            <dd className="num">{files.imported ?? 0}</dd>
            <dt>…with metadata issues</dt>
            <dd className="num">{dq.metadataIssues.length}</dd>
            <dt>Quarantined</dt>
            <dd className="num">{files.quarantined ?? 0}</dd>
            <dt>Skipped (out of scope)</dt>
            <dd className="num">{files.skipped ?? 0}</dd>
            <dt>Superseded</dt>
            <dd className="num">{files.superseded ?? 0}</dd>
            <dt>Removed from source</dt>
            <dd className="num">{files.removed ?? 0}</dd>
          </dl>
          <p className="mt-2 text-xs text-ink-3">
            Imported seasons: {cov.seasons.map(seasonLabel).join(", ")} (Division B and C). Division A and earlier seasons are not imported;
            historical backfill is supported by the importer.
          </p>
        </Panel>
        <Panel className="p-4 text-sm">
          <h2 className="font-semibold">Identity</h2>
          <dl className="mt-1 grid grid-cols-2 gap-1">
            <dt>Schools</dt>
            <dd className="num">{cov.counts.schools.toLocaleString()}</dd>
            <dt>Team-seasons</dt>
            <dd className="num">{cov.counts.teamSeasons.toLocaleString()}</dd>
            <dt>Tournament entries</dt>
            <dd className="num">{cov.counts.entries.toLocaleString()}</dd>
            <dt>Unresolved entries</dt>
            <dd className="num">{cov.counts.unresolved.toLocaleString()}</dd>
            <dt>Event results</dt>
            <dd className="num">{cov.counts.results.toLocaleString()}</dd>
          </dl>
        </Panel>
      </div>

      <Section id="seasons" title="Included seasons and tournaments">
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <thead>
              <tr>
                <th>Season</th>
                <th>Division</th>
                <th className="r">Tournaments</th>
                <th className="r">Rated</th>
                <th className="r">Entries</th>
                <th>First</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {cov.bySeason.map((s) => (
                <tr key={`${s.season}${s.division}`}>
                  <td>{seasonLabel(s.season)}</td>
                  <td>{s.division}</td>
                  <td className="r num">{s.tournaments}</td>
                  <td className="r num">{s.rated}</td>
                  <td className="r num">{s.entries.toLocaleString()}</td>
                  <td className="num">{fmtDate(s.first)}</td>
                  <td className="num">{fmtDate(s.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          By level: {cov.levels.map((l) => `${l.level} ${l.division} ${l.c}`).join(" · ")}. Tournament format: {dq.formats.map((f) => `${f.format} ${f.c}`).join(", ")} — no
          format has been explicitly recorded yet, so the online discount is currently inactive.
        </p>
      </Section>

      <Section id="model" title="Model version and fit diagnostics">
        <Panel className="p-4 text-sm">
          <p>
            Published build <span className="num">#{String(dq.build.id)}</span> · model <span className="num">{String(dq.build.model_version)}</span> ·
            finished {fmtDateTime(String(dq.build.finished_at))}
            {dq.build.recomputed_from ? ` · recomputed from ${String(dq.build.recomputed_from)}` : " · full rebuild"}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Parameters: {Object.entries(params).filter(([k]) => k !== "hash").map(([k, v]) => `${k}=${v}`).join(", ")}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Pool</th>
                  <th className="r">Refits</th>
                  <th className="r">With event detail</th>
                  <th>Latest</th>
                  <th className="r">Fits converged</th>
                  <th className="r">Events with local-only components (latest)</th>
                </tr>
              </thead>
              <tbody>
                {dq.snapshotsDiag.map((s) => {
                  const g = dq.graph.find((x) => x.division === s.division && x.view === s.view && x.season === s.season);
                  const diag = g ? (JSON.parse(g.diagnostics) as { converged: boolean; components: number; localOnlyEntities: number }[]) : [];
                  return (
                    <tr key={`${s.division}${s.view}${s.season}`}>
                      <td>
                        Div {s.division} · {s.view === "team" ? "Team Performance" : "School Potential"} · {seasonLabel(s.season)}
                      </td>
                      <td className="r num">{s.n}</td>
                      <td className="r num">{s.detail}</td>
                      <td className="num">{s.last}</td>
                      <td className="r num">
                        {diag.filter((d) => d.converged).length}/{diag.length}
                      </td>
                      <td className="r num">
                        {diag.filter((d) => d.components > 1).length} ({diag.reduce((a, d) => a + d.localOnlyEntities, 0)} entity-events)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Recent publishes: {dq.publishLog.map((p) => `#${p.build_id} ${fmtDateTime(String(p.published_at))} (${p.note})`).join("; ")}
          </p>
        </Panel>
      </Section>

      <Section id="unresolved" title="Unresolved identities" description="Entries shown in official results but excluded from Team Performance until a reviewed mapping resolves them.">
        <Panel className="p-4 text-sm">
          <ul className="grid gap-1">
            {dq.unresolvedByReason.map((u) => (
              <li key={u.reason}>
                <span className="num font-medium">{u.c}</span> — {u.reason}
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-ink-2">
              Review queue: {dq.labelSplitTotal} school-seasons with both an unlabeled team and labeled teams (possible label splits)
            </summary>
            <p className="mt-1 text-xs text-ink-3">
              These are kept separate because the source does not establish that the unlabeled entries are any particular labeled team. A reviewed
              entry in <span className="num">data/mappings/team-identity.yaml</span> can merge them.
            </p>
            <ul className="mt-2 grid gap-0.5 text-xs">
              {dq.labelSplits.map((l) => (
                <li key={`${l.id}${l.division}${l.season}`}>
                  <Link className="link" href={`/schools/${l.id}`}>
                    {l.name}
                  </Link>{" "}
                  · Div {l.division} {seasonLabel(l.season)}: {l.labels}
                </li>
              ))}
            </ul>
          </details>
        </Panel>
      </Section>

      <Section id="skipped" title="Quarantined and skipped files" description="Files that failed SciolyFF validation (other than award-metadata-only checks) are quarantined with the reason; good files are never blocked by bad ones.">
        <div className="max-h-96 overflow-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <thead>
              <tr>
                <th>File</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {dq.quarantined.map((f) => (
                <tr key={f.id}>
                  <td className="num whitespace-nowrap">
                    <a className="link" href={f.result_url}>
                      {f.id}
                    </a>
                  </td>
                  <td className="text-xs text-ink-2">{f.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-2">{dq.metadataIssues.length} files imported with award-metadata validation issues</summary>
          <p className="mt-1 text-xs text-ink-3">
            Policy: a file is still imported when every failing SciolyFF check concerns tournament or track trophy, medal, or bid counts, or the
            short-name rule — fields that cannot change placings, points, or ranks.
          </p>
          <ul className="mt-1 grid gap-0.5 text-xs">
            {dq.metadataIssues.map((f) => (
              <li key={f.id}>
                <Link className="link" href={`/tournaments/${f.id}`}>
                  {f.id}
                </Link>{" "}
                — {f.reason.replace("Imported with award-metadata validation issues (placings unaffected): ", "")}
              </li>
            ))}
          </ul>
        </details>
        {dq.excluded.length ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-ink-2">{dq.excluded.length} imported tournaments excluded from ratings</summary>
            <ul className="mt-1 grid gap-0.5 text-xs">
              {dq.excluded.map((t) => (
                <li key={t.id}>
                  <Link className="link" href={`/tournaments/${t.id}`}>
                    {t.name}
                  </Link>{" "}
                  — {t.exclusion_reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      <Section id="runs" title="Import runs">
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <thead>
              <tr>
                <th>Run</th>
                <th>Started</th>
                <th>Mode</th>
                <th>Status</th>
                <th className="r">Seen</th>
                <th className="r">Added</th>
                <th className="r">Changed</th>
                <th className="r">Unchanged</th>
                <th className="r">Quarantined</th>
                <th>Earliest affected</th>
              </tr>
            </thead>
            <tbody>
              {dq.runs.map((r) => (
                <tr key={String(r.id)}>
                  <td className="num">#{String(r.id)}</td>
                  <td className="num">{fmtDateTime(String(r.started_at))}</td>
                  <td>
                    {String(r.mode)} · {String(r.adapter)}
                  </td>
                  <td>
                    <Badge tone={r.status === "success" ? "lime" : r.status === "partial" ? "amber" : "red"}>{String(r.status)}</Badge>
                  </td>
                  <td className="r num">{String(r.files_seen)}</td>
                  <td className="r num">{String(r.files_added)}</td>
                  <td className="r num">{String(r.files_changed)}</td>
                  <td className="r num">{String(r.files_unchanged)}</td>
                  <td className="r num">{String(r.files_quarantined)}</td>
                  <td className="num">{r.earliest_affected_date ? String(r.earliest_affected_date) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="limits" title="Known limitations">
        <ul className="ml-5 list-disc space-y-1 text-sm text-ink-2">
          <li>Only tournaments published to Duosmium are included. Many regional and invitational results are never published, so coverage varies by state.</li>
          <li>Rankings are among indexed teams only and are not official Science Olympiad rankings.</li>
          <li>
            Public results do not identify students. Team Performance follows team labels (e.g. “Gold”), whose rosters may change within a season;
            there are no individual ratings.
          </li>
          <li>Unlabeled entries from schools that fielded several teams are unresolved and excluded from Team Performance.</li>
          <li>Tournament format (in-person/online) is not in the source files; it is unknown unless explicitly recorded, so all tournaments currently carry weight 1.</li>
          <li>Cross-season event equivalence is assumed only for same-named official events in consecutive seasons; rule changes were not reviewed event by event.</li>
          <li>Rating history is reconstructed from the current archive, not a record of what was displayed at the time.</li>
          <li>Model parameters are provisional hypotheses; see the backtest on the methodology page.</li>
        </ul>
      </Section>

      <Section id="corrections" title="Corrections">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel className="p-4 text-sm">
            <p className="font-medium">Wrong placement or team name in a result?</p>
            <p className="mt-1 text-ink-2">
              Results come from Duosmium. Report errors in the source archive on{" "}
              <a className="link" href="https://github.com/Duosmium/duosmium/issues">
                Duosmium&apos;s GitHub issues
              </a>
              . Once fixed there, the next sync detects the changed file by its content hash and recomputes ratings from that tournament&apos;s date.
            </p>
            <p className="mt-3 font-medium">Wrong school merge, team label, or exclusion on scly.io?</p>
            {correctionsUrl ? (
              <p className="mt-1">
                <a className="link" href={correctionsUrl}>
                  Report it to the scly.io maintainers
                </a>
                .
              </p>
            ) : (
              <p className="mt-1 text-ink-2">
                No online correction destination is configured for this deployment. Use the form to download your correction details and send them
                to the site maintainers.
              </p>
            )}
          </Panel>
          {!correctionsUrl ? (
            <Panel className="p-4">
              <CorrectionDownload context={{ Page: "/data", "Source revision": cov.sourceRevision ?? "unknown" }} />
            </Panel>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
