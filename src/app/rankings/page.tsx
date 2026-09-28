import Link from "next/link";
import type { Metadata } from "next";
import { Avatar, Change, Pager, teamLabel, usr } from "@/components/plain";
import { officialEvents, states } from "@/lib/queries/common";
import { getRankings, levels, PAGE_SIZE, type Period, type StatusFilter } from "@/lib/queries/rankings";
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
    sort: "rank",
    dir: "asc",
    page,
    onePerSchool: one(sp.one) === "1",
    period,
  });
  const season = res.season;
  const [events, stateList, levelList] = await Promise.all([
    season ? officialEvents(division, season) : Promise.resolve([]),
    states(),
    levels(),
  ]);
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
  const chip = (on: boolean, label: string, patch: Record<string, string | null>) => (
    <Link className={on ? "chip on" : "chip"} href={href(patch)}>
      {label}
    </Link>
  );
  const snapshots = mode === "event" ? res.snapshots.filter((s) => s.has_event_detail) : res.snapshots;

  return (
    <>
      <h1>Rankings</h1>
      <div className="chips">
        {chip(division === "C", "Division C", { div: "C", event: null, asof: null, season: null })}
        {chip(division === "B", "Division B", { div: "B", event: null, asof: null, season: null })}
        <span style={{ width: 8 }} />
        {chip(view === "team", "Teams", { view: null, one: null })}
        {chip(view === "school", "Schools", { view: "school", one: null })}
        <span style={{ width: 8 }} />
        {chip(mode === "overall", "Overall", { mode: null, event: null, status: null })}
        {chip(mode === "event", "By Event", { mode: "event", status: null })}
      </div>
      <form action="/rankings" className="filters">
        <input type="hidden" name="div" value={division} />
        {view === "school" ? <input type="hidden" name="view" value="school" /> : null}
        {mode === "event" ? <input type="hidden" name="mode" value="event" /> : null}
        {mode === "event" ? (
          <select name="event" defaultValue={one(sp.event)} aria-label="Event">
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ) : null}
        <select name="season" defaultValue={season ?? ""} aria-label="Season">
          {res.seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{String(s).slice(2)} season
            </option>
          ))}
        </select>
        <select name="asof" defaultValue={res.snapshot?.as_of ?? ""} aria-label="As of">
          {[...snapshots].reverse().map((s) => (
            <option key={s.id} value={s.as_of}>
              As of {s.as_of}
            </option>
          ))}
        </select>
        <select name="state" defaultValue={one(sp.state)} aria-label="State">
          <option value="">All states</option>
          {stateList.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="level" defaultValue={one(sp.level)} aria-label="Level">
          <option value="">All levels</option>
          {levelList.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select name="status" defaultValue={status} aria-label="Status">
          <option value="established">Ranked</option>
          <option value="provisional">Provisional</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        {mode === "overall" ? (
          <select name="period" defaultValue={period} aria-label="Change over">
            <option value="1w">1 week change</option>
            <option value="4w">4 week change</option>
            <option value="season">Season change</option>
          </select>
        ) : null}
        {view === "team" && mode === "overall" ? (
          <label className="muted">
            <input type="checkbox" name="one" value="1" defaultChecked={one(sp.one) === "1"} /> Top team per school
          </label>
        ) : null}
        <button>Apply</button>
      </form>

      <section className="card flush">
        {res.rows.length === 0 ? (
          <p style={{ padding: 16 }} className="muted">
            No results.
          </p>
        ) : (
          <ul className="rows">
            {mode === "overall" ? (
              <li className="row head">
                <span className="rank">#</span>
                <span className="avatar-sp" />
                <span className="who">{view === "team" ? "Team" : "School"}</span>
                <span className="col col-chg">Change</span>
                <span className="col col-trend">Season Trend</span>
                <span className="col col-usr">USR</span>
              </li>
            ) : null}
            {res.rows.map((r) => {
              const rank = mode === "event" ? r.eventRank : r.nationalRank;
              return (
                <li key={r.entityId} className="row">
                  <span className="rank">{rank ?? "-"}</span>
                  <Avatar name={r.schoolName} small />
                  <span className="who">
                    <Link href={view === "team" ? `/teams/${r.entityId}` : `/schools/${r.entityId}`}>
                      {r.schoolName} {view === "team" ? teamLabel(r.designation) : ""}
                    </Link>
                    <div className="sub">
                      {[r.city, r.state].filter(Boolean).join(", ")} · {r.tournaments} tournaments
                    </div>
                  </span>
                  {mode === "overall" ? (
                    <>
                      <span className="col col-chg">
                        <Change v={r.prevUsr === null ? null : r.usr - r.prevUsr} />
                      </span>
                      <span className="col col-trend">
                        <span className="pill trend">{usr(r.trendUsr)}</span>
                      </span>
                      <span className="col col-usr">
                        <span className="pill">{usr(r.usr)}</span>
                      </span>
                    </>
                  ) : (
                    <span className="pill">{usr(r.usr)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pager page={page} total={res.total} size={PAGE_SIZE} href={(p) => href({ page: String(p) })} />
      </section>
    </>
  );
}
