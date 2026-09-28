import Link from "next/link";
import type { Metadata } from "next";
import { CompareHistoryChart, DASH, SERIES } from "@/components/charts";
import { Badge, EmptyState, EvidenceBadge, Panel, Section, StatusBadge, btnCls, cx, inputCls, selectCls } from "@/components/ui";
import { fmtDate, fmtUsr, ordinal, seasonLabel, stateLabel } from "@/lib/format";
import { seasonsFor } from "@/lib/queries/common";
import { compareCandidates, compareData } from "@/lib/queries/compare";
import type { RatingView } from "@/lib/rating/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ComparePage(props: PageProps<"/compare">) {
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const view: RatingView = one(sp.view) === "school" ? "school" : "team";
  const division = one(sp.div) === "B" ? "B" : "C";
  const seasons = seasonsFor(division);
  const season = seasons.includes(Number(one(sp.season))) ? Number(one(sp.season)) : seasons[0];
  const ids = one(sp.ids).split(",").map((s) => s.trim()).filter(Boolean);
  const unique = [...new Set(ids)];
  const q = one(sp.q);
  const data = season ? compareData(view, division, season, unique) : null;
  const candidates = season && q ? compareCandidates(view, division, season, q) : [];
  const base = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ view, div: division, season: String(season ?? ""), ids: unique.join(",") });
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/compare?${p.toString()}`;
  };
  const ents = data?.entities ?? [];
  const name = (i: number) => {
    const l = ents[i].label;
    return view === "team" ? `${l.schoolName} ${l.designation || "(unlabeled)"}` : l.schoolName;
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Compare</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-3">
        Compare two to four teams or schools from the same division, rating view, and season. Numbers are only compared within one rating
        pool; no win probabilities are shown because they have not been calibrated.
      </p>

      <form action="/compare" className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-line bg-surface p-3">
        <input type="hidden" name="ids" value={unique.join(",")} />
        <label className="grid gap-1 text-xs font-medium text-ink-3">
          View
          <select name="view" defaultValue={view} className={selectCls}>
            <option value="team">Team Performance</option>
            <option value="school">School Potential</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-ink-3">
          Division
          <select name="div" defaultValue={division} className={selectCls}>
            <option value="C">Division C</option>
            <option value="B">Division B</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-ink-3">
          Season
          <select name="season" defaultValue={season} className={selectCls}>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-ink-3">
          Add a {view === "team" ? "team" : "school"}
          <input type="search" name="q" defaultValue={q} placeholder="Search by school name" className={cx(inputCls, "w-60")} />
        </label>
        <button className={btnCls}>Find</button>
      </form>
      <p className="mt-1 text-xs text-ink-3">Changing view, division, or season keeps the list only for entities that exist in the new pool.</p>

      {q ? (
        <Panel className="mt-3 p-3">
          <p className="text-sm font-medium">Matches for “{q}”</p>
          {candidates.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {candidates.map((c) => (
                <li key={c.id}>
                  {unique.includes(c.id) ? (
                    <Badge>Added: {c.name} {c.designation ?? ""}</Badge>
                  ) : unique.length >= 4 ? (
                    <span className="text-xs text-ink-3">{c.name} {c.designation ?? ""} (limit of 4 reached)</span>
                  ) : (
                    <Link className="rounded border border-line px-2 py-1 text-sm hover:border-cobalt" href={base({ ids: [...unique, c.id].join(","), q: null })}>
                      + {c.name} {view === "team" ? c.designation || "(unlabeled)" : ""} <span className="text-ink-3">{stateLabel(c.state)}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-3">No {view === "team" ? `Division ${division} ${seasonLabel(season ?? 0)} teams` : "rated schools"} match.</p>
          )}
        </Panel>
      ) : null}

      {data?.errors.length ? (
        <div className="mt-3 rounded-md border border-amber-ink/30 bg-amber-soft p-3 text-sm text-amber-ink">
          {data.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}

      {ents.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {ents.map((e, i) => (
            <li key={e.label.id} className="flex items-center gap-2 rounded border border-line bg-surface py-1 pr-1 pl-2 text-sm">
              <svg aria-hidden width="18" height="6">
                <line x1="0" y1="3" x2="18" y2="3" stroke={SERIES[i]} strokeWidth="2" strokeDasharray={DASH[i]} />
              </svg>
              <Link className="link" href={view === "team" ? `/teams/${e.label.id}` : `/schools/${e.label.id}`}>
                {name(i)}
              </Link>
              <Link href={base({ ids: unique.filter((x) => x !== e.label.id).join(",") })} className="rounded px-1.5 text-ink-3 hover:text-red-ink" aria-label={`Remove ${name(i)}`}>
                ×
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {ents.length < 2 ? (
        <div className="mt-5">
          <EmptyState title={ents.length ? "Add at least one more to compare" : "Choose what to compare"}>
            Search above to add {view === "team" ? "teams" : "schools"}, or use the Compare button on any team or school page.
          </EmptyState>
        </div>
      ) : (
        <>
          <Section title="Summary" id="summary">
            <div className="overflow-x-auto rounded-md border border-line bg-surface">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{view === "team" ? "Team" : "School"}</th>
                    <th className="r">USR</th>
                    <th className="r">Rank</th>
                    <th>Status</th>
                    <th className="r">Event coverage</th>
                    <th className="r">Tournaments</th>
                    <th>As of</th>
                  </tr>
                </thead>
                <tbody>
                  {ents.map((e, i) => (
                    <tr key={e.label.id}>
                      <td className="font-medium">{name(i)}</td>
                      <td className="r num text-base font-semibold">{fmtUsr(e.latest?.usr)}</td>
                      <td className="r num">{e.latest?.nationalRank ? `#${e.latest.nationalRank}` : "—"}</td>
                      <td>
                        <StatusBadge status={e.latest?.status ?? null} />
                      </td>
                      <td className="r num">
                        {e.latest?.comparableEvents ?? 0}/{data!.events.length}
                      </td>
                      <td className="r num">{e.latest?.tournaments ?? 0}</td>
                      <td className="num">{fmtDate(e.latest?.asOf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ents.some((e) => e.latest?.status !== "established") ? (
              <p className="mt-2 text-sm text-amber-ink">
                Insufficient evidence for a full overall comparison: at least one entry is not established (missing nationally comparable results
                in some official events or fewer than three tournaments). Its overall value relies on the latent prior for missing events.
              </p>
            ) : null}
          </Section>

          <Section title="Rating histories" id="histories" description="Aligned on the same weekly refit dates for this pool. Gaps mean no rating yet.">
            <Panel className="p-3">
              <CompareHistoryChart dates={data!.snaps.map((s) => s.as_of)} series={ents.map((e, i) => ({ name: name(i), values: e.hist.map((h) => h.usr) }))} />
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-ink-2">Table view</summary>
                <div className="mt-2 max-h-80 overflow-auto">
                  <table className="dtable">
                    <thead>
                      <tr>
                        <th>Refit</th>
                        {ents.map((e, i) => (
                          <th key={e.label.id} className="r">
                            {name(i)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data!.snaps.map((s, k) => (
                        <tr key={s.as_of}>
                          <td className="num">{s.as_of}</td>
                          {ents.map((e) => (
                            <td key={e.label.id} className="r num">
                              {fmtUsr(e.hist[k]?.usr)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Panel>
          </Section>

          <Section title="Head to head (actual placements)" id="h2h" description="Counts from tournaments and event fields both entered. Overall uses official standings; events use model ranks among eligible participants. These are results, not predictions.">
            <div className="overflow-x-auto rounded-md border border-line bg-surface">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th className="r">Overall finishes (W–L–T)</th>
                    <th className="r">Event finishes (W–L–T)</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.pairs.map((p) => {
                    const ia = ents.findIndex((e) => e.label.id === p.a);
                    const ib = ents.findIndex((e) => e.label.id === p.b);
                    const none = p.overall.every((x) => x === 0) && p.events.every((x) => x === 0);
                    return (
                      <tr key={p.a + p.b}>
                        <td>
                          {name(ia)} <span className="text-ink-3">vs</span> {name(ib)}
                        </td>
                        {none ? (
                          <td colSpan={2} className="r text-ink-3">
                            No shared results
                          </td>
                        ) : (
                          <>
                            <td className="r num">{p.overall.join("–")}</td>
                            <td className="r num">{p.events.join("–")}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Event ratings" id="events" description={data!.detail ? `From the ${fmtDate(data!.detail.as_of)} refit. “Local only” values are not nationally comparable and are not compared.` : "No event-detail refit available."}>
            <div className="overflow-x-auto rounded-md border border-line bg-surface">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Event</th>
                    {ents.map((e, i) => (
                      <th key={e.label.id} className="r">
                        {name(i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data!.events.map((ev) => {
                    const vals = ents.map((e) => data!.eventRatings.get(e.label.id)?.get(ev.id));
                    const comparable = vals.filter((v) => v && v.component === 0);
                    const best = comparable.length >= 2 ? Math.max(...comparable.map((v) => v!.usr)) : null;
                    return (
                      <tr key={ev.id}>
                        <td className="font-medium">{ev.name}</td>
                        {vals.map((v, i) => (
                          <td key={i} className="r">
                            {v ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className={cx("num", v.component === 0 && v.usr === best ? "font-semibold text-cobalt-2" : "")}>{fmtUsr(v.usr)}</span>
                                <span className="text-xs text-ink-3">n={v.appearances}</span>
                                {v.evidence !== "strong" ? <EvidenceBadge evidence={v.evidence} /> : null}
                              </span>
                            ) : (
                              <span className="text-xs text-ink-3">Insufficient evidence</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Common tournaments" id="common">
            {data!.common.length ? (
              <div className="overflow-x-auto rounded-md border border-line bg-surface">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Tournament</th>
                      {ents.map((e, i) => (
                        <th key={e.label.id} className="r">
                          {name(i)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data!.common.map((t) => (
                      <tr key={t.id}>
                        <td className="num">{fmtDate(t.endDate)}</td>
                        <td>
                          <Link className="link" href={`/tournaments/${t.id}`}>
                            {t.name}
                          </Link>
                        </td>
                        {ents.map((e) => {
                          const s = data!.standings.get(e.label.id)?.get(t.id);
                          return (
                            <td key={e.label.id} className="r num">
                              {s ? (s.rank ? `${ordinal(s.rank)} / ${s.field}` : "—") : <span className="text-ink-3">did not enter</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No shared results">These entries did not compete at the same tournament this season.</EmptyState>
            )}
            {view === "school" ? <p className="mt-1 text-xs text-ink-3">School rows show each school&apos;s best team finish in the official standings.</p> : null}
          </Section>
        </>
      )}
    </div>
  );
}
