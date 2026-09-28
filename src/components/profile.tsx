import Link from "next/link";
import { Badge, EvidenceBadge } from "@/components/ui";
import { fmtDate, fmtUsr, STATUS_TEXT } from "@/lib/format";
import type { EventBreakdownRow, HistoryPoint } from "@/lib/queries/profiles";

export function HistoryTable({ hist, tournamentNames }: { hist: HistoryPoint[]; tournamentNames: Map<string, string> }) {
  return (
    <div className="mt-2 max-h-80 overflow-auto">
      <table className="dtable">
        <thead>
          <tr>
            <th>Refit as of</th>
            <th className="r">USR</th>
            <th>Status</th>
            <th className="r">Rank</th>
            <th>New results that week</th>
          </tr>
        </thead>
        <tbody>
          {hist.map((h) => (
            <tr key={h.asOf}>
              <td className="num">{h.asOf}</td>
              <td className="r num">{fmtUsr(h.usr)}</td>
              <td>{h.status ?? <span className="text-ink-3">no rating</span>}</td>
              <td className="r num">{h.nationalRank ? `#${h.nationalRank}` : "—"}</td>
              <td className="text-xs text-ink-2">{(h.explain?.t ?? []).map((t) => tournamentNames.get(t) ?? t).join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EventBreakdown({ rows }: { rows: EventBreakdownRow[] }) {
  return (
    <div className="grid gap-2">
      {rows.map((ev) => (
        <details key={ev.eventDefId} className="group rounded-md border border-line bg-surface">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
            <span className="min-w-[11rem] font-medium">{ev.name}</span>
            {ev.rating ? (
              <>
                <span className="num text-lg font-semibold">{fmtUsr(ev.rating.usr)}</span>
                <span className="num text-sm text-ink-2">{ev.rating.eventRank ? `#${ev.rating.eventRank} of ${ev.rankedCount}` : "unranked"}</span>
                <EvidenceBadge evidence={ev.rating.evidence} />
                <span className="num text-xs text-ink-3">
                  {ev.rating.appearances} appearance{ev.rating.appearances === 1 ? "" : "s"} · {ev.rating.uniqueOpponents} opponents · n_eff{" "}
                  {ev.rating.nEff.toFixed(1)} · shrinkage {(ev.rating.shrinkage * 100).toFixed(0)}% · last {fmtDate(ev.rating.lastDate, false)}
                  {ev.rating.component !== 0 ? ` · component ${ev.rating.component} (local only)` : ""}
                  {ev.rating.weak ? " · weakly connected" : ""}
                </span>
              </>
            ) : ev.eventDefId.startsWith("other:") ? (
              <Badge>Not an official event this season — shown, not rated</Badge>
            ) : (
              <span className="text-sm text-ink-3">No eligible result — counts as the latent prior in the overall</span>
            )}
            <span className="ml-auto text-xs text-cobalt group-open:hidden">Show results</span>
          </summary>
          <div className="overflow-x-auto border-t border-line-2">
            {ev.results.length ? (
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tournament</th>
                    <th className="r">Official place</th>
                    <th className="r">Points</th>
                    <th className="r">Model rank / n</th>
                    <th className="r">x</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.results.map((r) => (
                    <tr key={r.fieldId + (r.viaEntry ?? "")}>
                      <td className="num whitespace-nowrap">{fmtDate(r.endDate, false)}</td>
                      <td>
                        <Link href={`/tournaments/${r.tournamentId}`} className="link">
                          {r.tournamentName}
                        </Link>
                        {r.viaEntry !== null && r.viaEntry !== undefined ? <div className="text-xs text-ink-3">via {r.viaEntry || "unlabeled"} entry</div> : null}
                      </td>
                      <td className="r num">
                        {r.status === "placed" ? `${r.place}${r.tie ? " (tie)" : ""}` : STATUS_TEXT[r.status] || r.status}
                        {r.dropped ? <span className="text-ink-3"> dropped</span> : null}
                      </td>
                      <td className="r num">{r.points ?? "—"}</td>
                      <td className="r num">{r.modelRank !== null ? `${r.modelRank} / ${r.n}` : "—"}</td>
                      <td className="r num">{r.x !== null ? r.x.toFixed(2) : "—"}</td>
                      <td className="text-xs text-ink-3">
                        {r.trial ? "trial · " : ""}
                        {r.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-3 py-2 text-sm text-ink-3">No official results in this event.</p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
