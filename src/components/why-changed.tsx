import Link from "next/link";
import { Delta, Panel, Section } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { HistoryPoint } from "@/lib/queries/profiles";

/**
 * Attribution is stored in latent units and telescopes exactly to the latent
 * change. For display it is rescaled to USR by the secant slope between the
 * two refits, so the parts sum to the displayed USR change.
 */
function usrParts(prev: HistoryPoint, cur: HistoryPoint) {
  const dz = (cur.z ?? 0) - (prev.z ?? 0);
  const du = (cur.usr ?? 0) - (prev.usr ?? 0);
  const k = Math.abs(dz) > 1e-12 ? du / dz : 0;
  return {
    total: du,
    added: (cur.dAdded ?? 0) * k,
    recency: (cur.dRecency ?? 0) * k,
    field: (cur.dField ?? 0) * k,
    other: (cur.dOther ?? 0) * k,
    k,
  };
}

export function WhyChanged({
  hist,
  eventNames,
  tournamentNames,
  corrections,
  view,
}: {
  hist: HistoryPoint[];
  eventNames: Map<string, string>;
  tournamentNames: Map<string, string>;
  corrections: { file_id: string; change: string; detail: string | null; started_at: string }[];
  view: "team" | "school";
}) {
  const pairs: { prev: HistoryPoint; cur: HistoryPoint }[] = [];
  for (let i = 1; i < hist.length; i++) {
    if (hist[i].usr !== null && hist[i - 1].usr !== null) pairs.push({ prev: hist[i - 1], cur: hist[i] });
  }
  const moving = pairs.filter((p) => Math.abs((p.cur.usr ?? 0) - (p.prev.usr ?? 0)) >= 0.005);
  const latest = moving[moving.length - 1];
  const withoutNew = pairs.filter((p) => !(p.cur.explain?.t?.length) && Math.abs((p.cur.usr ?? 0) - (p.prev.usr ?? 0)) >= 0.005).length;

  return (
    <Section
      id="why"
      title="Why did this change?"
      description={
        <>
          Every weekly refit re-estimates all ratings from the eligible results in the window, so a rating can move without a new appearance by
          this {view === "team" ? "team" : "school"}. Each change is split exactly into: <b>new results</b> (this entity&apos;s results added since
          the previous refit), <b>recency</b> (older results losing weight as they age), <b>field recalibration</b> (updated strength estimates of
          the event fields it competed in, driven by other teams&apos; results), and <b>window/coverage</b> (results leaving the 400-day window or
          changes in national comparability).
        </>
      }
    >
      {latest ? (
        <Panel className="p-4">
          <ChangeCard prev={latest.prev} cur={latest.cur} eventNames={eventNames} tournamentNames={tournamentNames} />
          {withoutNew ? (
            <p className="mt-3 text-xs text-ink-3">
              In <span className="num">{withoutNew}</span> of the <span className="num">{pairs.length}</span> refits this season, the rating
              moved with no new result by this {view === "team" ? "team" : "school"}.
            </p>
          ) : null}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-ink-2">All refits with changes</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Refit</th>
                    <th className="r">Δ USR</th>
                    <th className="r">New results</th>
                    <th className="r">Recency</th>
                    <th className="r">Field recal.</th>
                    <th className="r">Window/coverage</th>
                    <th>New results by this entity</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pairs].reverse().map(({ prev, cur }) => {
                    const u = usrParts(prev, cur);
                    return (
                      <tr key={cur.asOf}>
                        <td className="num">{cur.asOf}</td>
                        <td className="r">
                          <Delta value={u.total} />
                        </td>
                        <td className="r">
                          <Delta value={u.added} />
                        </td>
                        <td className="r">
                          <Delta value={u.recency} />
                        </td>
                        <td className="r">
                          <Delta value={u.field} />
                        </td>
                        <td className="r">
                          <Delta value={u.other} />
                        </td>
                        <td className="text-xs text-ink-2">{(cur.explain?.t ?? []).map((t) => tournamentNames.get(t) ?? t).join("; ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>
      ) : (
        <Panel className="p-4 text-sm text-ink-3">No change between refits yet — the rating has at most one refit so far.</Panel>
      )}
      <Panel className="mt-3 p-4 text-sm">
        <p className="font-medium">Data corrections</p>
        {corrections.length ? (
          <ul className="mt-1 grid gap-1 text-ink-2">
            {corrections.map((c, i) => (
              <li key={i}>
                {fmtDate(c.started_at)}:{" "}
                <Link className="link" href={`/tournaments/${c.file_id}`}>
                  {tournamentNames.get(c.file_id) ?? c.file_id}
                </Link>{" "}
                — source file {c.change} ({c.detail ?? "content hash changed"}). Ratings were recomputed from that tournament&apos;s date forward.
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-ink-3">No source corrections have been recorded for tournaments this entity attended since import began.</p>
        )}
      </Panel>
    </Section>
  );
}

function ChangeCard({
  prev,
  cur,
  eventNames,
  tournamentNames,
}: {
  prev: HistoryPoint;
  cur: HistoryPoint;
  eventNames: Map<string, string>;
  tournamentNames: Map<string, string>;
}) {
  const u = usrParts(prev, cur);
  const parts = [
    { label: "New results", v: u.added },
    { label: "Recency decay", v: u.recency },
    { label: "Field recalibration", v: u.field },
    { label: "Window / coverage", v: u.other },
  ];
  return (
    <div>
      <p className="text-sm">
        Most recent change: refit of <span className="num">{fmtDate(prev.asOf)}</span> → <span className="num">{fmtDate(cur.asOf)}</span>, USR{" "}
        <span className="num">{prev.usr!.toFixed(2)}</span> → <span className="num font-semibold">{cur.usr!.toFixed(2)}</span> (<Delta value={u.total} />
        ).
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} className="rounded border border-line-2 px-3 py-2">
            <dt className="text-xs text-ink-3">{p.label}</dt>
            <dd className="text-lg">
              <Delta value={p.v} />
            </dd>
          </div>
        ))}
      </dl>
      {cur.explain?.t?.length ? (
        <p className="mt-3 text-sm text-ink-2">
          New results included:{" "}
          {cur.explain.t.map((t, i) => (
            <span key={t}>
              {i ? "; " : ""}
              <Link className="link" href={`/tournaments/${t}`}>
                {tournamentNames.get(t) ?? t}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-2">No new result by this entity in this refit — the change comes from other teams&apos; results and aging.</p>
      )}
      {cur.explain?.e?.length ? (
        <div className="mt-2 text-sm">
          <p className="text-ink-3">Largest event contributions (USR, approx.):</p>
          <ul className="mt-1 grid gap-0.5">
            {cur.explain.e.map(([ev, a, r, f, o]) => (
              <li key={ev} className="flex flex-wrap gap-x-3">
                <span className="min-w-[10rem] font-medium">{eventNames.get(ev) ?? ev}</span>
                <span>
                  total <Delta value={(a + r + f + o) * u.k} />
                </span>
                <span className="text-xs text-ink-3">
                  new {fmtNum(a * u.k)} · recency {fmtNum(r * u.k)} · field {fmtNum(f * u.k)} · window {fmtNum(o * u.k)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const fmtNum = (v: number) => (Math.abs(v) < 0.005 ? "0.00" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`);
