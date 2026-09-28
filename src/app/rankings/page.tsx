import Link from "next/link";
import type { Metadata } from "next";
import { AutoSubmitForm } from "@/components/client-bits";
import { Badge, Delta, EmptyState, EvidenceBadge, Pagination, StatusBadge, cx, inputCls, selectCls } from "@/components/ui";
import { fmtDate, fmtUsr, seasonLabel, stateLabel } from "@/lib/format";
import { officialEvents, states } from "@/lib/queries/common";
import { getRankings, levels, PAGE_SIZE, type Period, type SortKey, type StatusFilter } from "@/lib/queries/rankings";
import type { RatingView } from "@/lib/rating/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rankings" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RankingsPage(props: PageProps<"/rankings">) {
  const sp = (await props.searchParams) as SP;
  const division = one(sp.div) === "B" ? "B" : "C";
  const view: RatingView = one(sp.view) === "school" ? "school" : "team";
  const mode = one(sp.mode) === "event" ? "event" : "overall";
  const statusRaw = one(sp.status);
  const status: StatusFilter = (["established", "provisional", "inactive", "all"] as const).includes(statusRaw as StatusFilter)
    ? (statusRaw as StatusFilter)
    : mode === "event"
      ? "all"
      : "established";
  const sort = ((["rank", "usr", "change", "tournaments", "last", "name"] as const).includes(one(sp.sort) as SortKey) ? one(sp.sort) : "rank") as SortKey;
  const dir = one(sp.dir) === "desc" ? "desc" : one(sp.dir) === "asc" ? "asc" : sort === "rank" || sort === "name" ? "asc" : "desc";
  const period = (["1w", "4w", "season"] as const).includes(one(sp.period) as Period) ? (one(sp.period) as Period) : "4w";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const res = await getRankings({
    division,
    view,
    season: Number(one(sp.season)) || undefined,
    asOf: one(sp.asof) || undefined,
    mode,
    event: one(sp.event) || undefined,
    state: one(sp.state) || undefined,
    level: one(sp.level) || undefined,
    status,
    q: one(sp.q) || undefined,
    sort,
    dir,
    page,
    onePerSchool: one(sp.one) === "1",
    period,
  });
  const season = res.season;
  const [events, stateList, levelList] = await Promise.all([season ? officialEvents(division, season) : Promise.resolve([]), states(), levels()]);
  const event = mode === "event" ? events.find((e) => e.id === one(sp.event)) ?? events[0] : undefined;
  const current = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (one(v)) current.set(k, one(v));
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(current);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    if (!("page" in patch)) p.delete("page");
    return `/rankings?${p.toString()}`;
  };
  const sortHref = (key: SortKey) =>
    href({ sort: key, dir: sort === key ? (dir === "asc" ? "desc" : "asc") : key === "rank" || key === "name" ? "asc" : "desc" });
  const snap = res.snapshot;
  const excluded = snap ? (JSON.parse(snap.excluded_counts) as Record<string, number>) : null;
  const filtered = Boolean(one(sp.state) || one(sp.level) || one(sp.q) || status !== "established" || one(sp.one));
  const detailDates = res.snapshots.filter((s) => s.has_event_detail).map((s) => s.as_of);

  const sortTh = (k: SortKey, children: React.ReactNode, className?: string) => (
    <th className={className} aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={sortHref(k)} className="hover:text-ink">
        {children}
        {sort === k ? <span aria-hidden> {dir === "asc" ? "▲" : "▼"}</span> : null}
      </Link>
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rankings</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-3">
            Rankings among indexed teams in Duosmium tournaments — not a complete national list. Division B and C are separate rating pools;
            Team Performance and School Potential are fitted independently and never mixed.
          </p>
        </div>
      </div>

      {/* Primary pool switches */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Division" className="inline-flex rounded-md border border-line bg-surface p-0.5">
          {(["C", "B"] as const).map((d) => (
            <Link key={d} href={href({ div: d, season: null, asof: null, event: null })} aria-current={division === d ? "true" : undefined}
              className={cx("rounded px-3 py-1.5 text-sm font-medium", division === d ? "bg-cobalt text-white" : "text-ink-2 hover:bg-line-2")}>
              Division {d}
            </Link>
          ))}
        </div>
        <div role="group" aria-label="Rating view" className="inline-flex rounded-md border border-line bg-surface p-0.5">
          {(["team", "school"] as const).map((v) => (
            <Link key={v} href={href({ view: v, asof: null, one: null })} aria-current={view === v ? "true" : undefined}
              className={cx("rounded px-3 py-1.5 text-sm font-medium", view === v ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2")}>
              {v === "team" ? "Team Performance" : "School Potential"}
            </Link>
          ))}
        </div>
        <div role="group" aria-label="Overall or event" className="inline-flex rounded-md border border-line bg-surface p-0.5">
          {(["overall", "event"] as const).map((m) => (
            <Link key={m} href={href({ mode: m === "overall" ? null : m, event: null, status: null, sort: null, dir: null })} aria-current={mode === m ? "true" : undefined}
              className={cx("rounded px-3 py-1.5 text-sm font-medium", mode === m ? "bg-line-2 text-ink" : "text-ink-2 hover:bg-line-2")}>
              {m === "overall" ? "Overall" : "By event"}
            </Link>
          ))}
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-2">
        {view === "team" ? (
          <>
            <span className="font-medium">Team Performance</span> rates each actual team entry label (for example “Gold” or “A”) within one season.
            It reflects entries under that label, not a fixed group of students.
          </>
        ) : (
          <>
            <span className="font-medium">School Potential</span> superscores each school&apos;s entries event by event within each tournament.
            It may not correspond to any single roster the school could field.
          </>
        )}
      </p>

      {/* Filters */}
      <AutoSubmitForm action="/rankings" className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-line bg-surface p-3">
        <input type="hidden" name="div" value={division} />
        <input type="hidden" name="view" value={view} />
        {mode === "event" ? <input type="hidden" name="mode" value="event" /> : null}
        <Field label="Season">
          <select name="season" defaultValue={season ?? ""} className={selectCls}>
            {res.seasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="As of">
          <select name="asof" defaultValue={snap?.as_of ?? ""} className={selectCls}>
            {[...(mode === "event" ? res.snapshots.filter((s) => s.has_event_detail) : res.snapshots)].reverse().map((s) => (
              <option key={s.id} value={s.as_of}>
                {fmtDate(s.as_of)}
              </option>
            ))}
          </select>
        </Field>
        {mode === "event" ? (
          <Field label="Event">
            <select name="event" defaultValue={event?.id ?? ""} className={selectCls}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="State">
          <select name="state" defaultValue={one(sp.state)} className={selectCls}>
            <option value="">All states</option>
            {stateList.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Competed at level">
          <select name="level" defaultValue={one(sp.level)} className={selectCls}>
            <option value="">Any level</option>
            {levelList.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rating status">
          <select name="status" defaultValue={status} className={selectCls}>
            <option value="established">Established (ranked)</option>
            <option value="provisional">Provisional</option>
            <option value="inactive">Inactive</option>
            <option value="all">All statuses</option>
          </select>
        </Field>
        {mode === "overall" ? (
          <Field label="Change over">
            <select name="period" defaultValue={period} className={selectCls}>
              <option value="1w">1 week</option>
              <option value="4w">4 weeks</option>
              <option value="season">Season to date</option>
            </select>
          </Field>
        ) : null}
        {view === "team" && mode === "overall" ? (
          <label className="flex items-center gap-1.5 self-center pt-4 text-sm">
            <input type="checkbox" name="one" value="1" defaultChecked={one(sp.one) === "1"} className="h-4 w-4 accent-[var(--cobalt)]" />
            One entry per school
          </label>
        ) : null}
        <Field label="Search">
          <span className="flex gap-1">
            <input type="search" name="q" defaultValue={one(sp.q)} placeholder="School or team" className={cx(inputCls, "w-44")} />
            <button className="rounded border border-line px-2.5 text-sm hover:border-cobalt">Go</button>
          </span>
        </Field>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
      </AutoSubmitForm>

      {/* Scope note */}
      {snap ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
          <span>
            Division {division} · {seasonLabel(snap.season)} season · model refit as of <span className="num">{snap.as_of}</span> · M ={" "}
            <span className="num">{snap.official_events}</span> official events
          </span>
          <span>
            <span className="num">{snap.established_count.toLocaleString()}</span> established of{" "}
            <span className="num">{snap.entity_count.toLocaleString()}</span> rated {view === "team" ? "teams" : "schools"}
            {excluded ? (
              <>
                {" "}
                (not ranked: <span className="num">{excluded.belowEventCoverage.toLocaleString()}</span> lack comparable results in all events,{" "}
                <span className="num">{excluded.belowTournamentCount.toLocaleString()}</span> have fewer than 3 tournaments,{" "}
                <span className="num">{excluded.inactive}</span> inactive)
              </>
            ) : null}
          </span>
          <span>
            {mode === "overall"
              ? "Ranks are national (#) and state positions among established entries, computed from the full pool before filtering and pagination. Filters never renumber ranks."
              : "Event rank counts every entity with nationally comparable results in this event (reference component), before filtering."}
            {view === "team" && one(sp.one) === "1"
              ? " One-entry-per-school view: each school's highest-rated established team (or highest-rated team if none is established)."
              : ""}
          </span>
          {res.eventDetailUnavailable ? (
            <span className="text-amber-ink">Event ratings are stored for selected refit dates only ({detailDates.join(", ")}); showing the nearest earlier one.</span>
          ) : null}
        </div>
      ) : null}

      {!snap ? (
        <div className="mt-4">
          <EmptyState title="No ratings for this selection">No snapshot exists for this division and view yet.</EmptyState>
        </div>
      ) : res.rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No teams match these filters">
            {filtered ? (
              <>
                Try{" "}
                <Link className="link" href={`/rankings?div=${division}&view=${view}`}>
                  clearing filters
                </Link>{" "}
                or selecting “All statuses”.
              </>
            ) : null}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <caption className="sr-only">
              {mode === "event" ? `${event?.name} event ratings` : "Overall ratings"}, Division {division}, {view === "team" ? "Team Performance" : "School Potential"}, as of {snap.as_of}
            </caption>
            <thead>
              <tr>
                {sortTh("rank", <>{mode === "event" ? "Ev #" : "#"}</>, "w-16")}
                {sortTh("name", <>{view === "team" ? "School · team" : "School"}</>)}
                <th className="hidden sm:table-cell">State</th>
                {sortTh("usr", <>USR</>, "r")}
                {mode === "overall" ? (
                  sortTh("change", <>Δ {period === "season" ? "season" : period}</>, "r hidden sm:table-cell")
                ) : (
                  <th className="r hidden sm:table-cell">Appearances</th>
                )}
                {sortTh("tournaments", <>Tourn.</>, "r hidden md:table-cell")}
                {sortTh("last", <>Last result</>, "hidden md:table-cell")}
                <th className="hidden lg:table-cell">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => {
                const link = view === "team" ? `/teams/${r.entityId}` : `/schools/${r.entityId}`;
                const rank = mode === "event" ? r.eventRank : r.nationalRank;
                return (
                  <tr key={r.entityId}>
                    <td className="num font-medium">
                      {rank ?? <span className="text-ink-3">—</span>}
                      {mode === "overall" && r.stateRank ? <div className="text-[11px] font-normal whitespace-nowrap text-ink-3">{r.state} #{r.stateRank}</div> : null}
                    </td>
                    <td className="min-w-[12rem]">
                      <Link href={link} className="font-medium text-ink hover:text-cobalt hover:underline">
                        {r.schoolName}
                      </Link>
                      {view === "team" ? (
                        <span className="ml-1.5 text-ink-2">{r.designation ? r.designation : <span className="text-ink-3 italic">unlabeled</span>}</span>
                      ) : null}
                      <div className="text-xs text-ink-3 sm:hidden">{stateLabel(r.state)}</div>
                    </td>
                    <td className="hidden text-ink-2 sm:table-cell">{stateLabel(r.state)}</td>
                    <td className="r">
                      <span className="num text-base font-semibold">{fmtUsr(r.usr)}</span>
                    </td>
                    {mode === "overall" ? (
                      <td className="r hidden sm:table-cell">
                        <Delta value={r.prevUsr === null ? null : r.usr - r.prevUsr} />
                      </td>
                    ) : (
                      <td className="r num hidden sm:table-cell">
                        {r.appearances}
                        <span className="text-ink-3"> · n_eff {r.nEff?.toFixed(1)}</span>
                      </td>
                    )}
                    <td className="r num hidden md:table-cell">{r.tournaments}</td>
                    <td className="num hidden text-ink-2 md:table-cell">{fmtDate(r.lastCompetition)}</td>
                    <td className="hidden lg:table-cell">
                      {mode === "event" && r.evidence ? (
                        <EvidenceBadge evidence={r.evidence} />
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <StatusBadge status={r.status} />
                          {r.status !== "established" ? (
                            <Badge title="Nationally comparable official events">
                              {r.comparableEvents}/{snap.official_events} ev
                            </Badge>
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={res.total} pageSize={PAGE_SIZE} href={(p) => href({ page: String(p) })} />
      <p className="mt-4 text-xs text-ink-3">
        USR is an experimental display scale (0–20; a latent value of 0 maps to 10). Ratings are not calibrated across divisions, views,
        seasons, or events. <Link className="link" href="/methodology">How ratings work</Link>.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-ink-3">
      {label}
      {children}
    </label>
  );
}
