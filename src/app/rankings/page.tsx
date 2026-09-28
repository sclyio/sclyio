import Link from "next/link";
import type { Metadata } from "next";
import { delta, Pager, teamLabel, usr } from "@/components/plain";
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
  const sortLink = (key: SortKey, label: string) => (
    <Link href={href({ sort: key, dir: sort === key ? (dir === "asc" ? "desc" : "asc") : key === "rank" || key === "name" ? "asc" : "desc" })}>
      {label}
    </Link>
  );
  const snap = res.snapshot;
  const snapshots = mode === "event" ? res.snapshots.filter((s) => s.has_event_detail) : res.snapshots;

  return (
    <>
      <h1>Rankings</h1>
      <form action="/rankings">
        <select name="div" defaultValue={division} aria-label="Division">
          <option value="C">Division C</option>
          <option value="B">Division B</option>
        </select>{" "}
        <select name="view" defaultValue={view} aria-label="View">
          <option value="team">Teams</option>
          <option value="school">Schools (superscore)</option>
        </select>{" "}
        <select name="mode" defaultValue={mode} aria-label="Overall or event">
          <option value="overall">Overall</option>
          <option value="event">By event</option>
        </select>{" "}
        {mode === "event" ? (
          <select name="event" defaultValue={one(sp.event)} aria-label="Event">
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ) : null}{" "}
        <select name="season" defaultValue={season ?? ""} aria-label="Season">
          {res.seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{s}
            </option>
          ))}
        </select>{" "}
        <select name="asof" defaultValue={snap?.as_of ?? ""} aria-label="As of">
          {[...snapshots].reverse().map((s) => (
            <option key={s.id} value={s.as_of}>
              {s.as_of}
            </option>
          ))}
        </select>{" "}
        <select name="state" defaultValue={one(sp.state)} aria-label="State">
          <option value="">All states</option>
          {stateList.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>{" "}
        <select name="level" defaultValue={one(sp.level)} aria-label="Competed at level">
          <option value="">Any level</option>
          {levelList.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>{" "}
        <select name="status" defaultValue={status} aria-label="Status">
          <option value="established">Ranked</option>
          <option value="provisional">Provisional</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>{" "}
        <select name="period" defaultValue={period} aria-label="Change over">
          <option value="1w">Change: 1 week</option>
          <option value="4w">Change: 4 weeks</option>
          <option value="season">Change: season</option>
        </select>{" "}
        {view === "team" ? (
          <label>
            <input type="checkbox" name="one" value="1" defaultChecked={one(sp.one) === "1"} /> Best team per school
          </label>
        ) : null}{" "}
        <input name="q" defaultValue={one(sp.q)} size={16} placeholder="Name" aria-label="Search name" /> <button>Go</button>
      </form>

      {!snap || res.rows.length === 0 ? (
        <p>No results.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{sortLink("rank", "#")}</th>
                <th>{sortLink("name", view === "team" ? "Team" : "School")}</th>
                <th>State</th>
                <th>{sortLink("usr", "USR")}</th>
                <th>{mode === "overall" ? sortLink("change", "Change") : "Appearances"}</th>
                <th>{sortLink("tournaments", "Tournaments")}</th>
                <th>{sortLink("last", "Last")}</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => {
                const rank = mode === "event" ? r.eventRank : r.nationalRank;
                return (
                  <tr key={r.entityId}>
                    <td className="n">{rank ?? "-"}</td>
                    <td>
                      <Link href={view === "team" ? `/teams/${r.entityId}` : `/schools/${r.entityId}`}>
                        {r.schoolName}
                        {view === "team" ? ` ${teamLabel(r.designation)}` : ""}
                      </Link>
                    </td>
                    <td>{r.state}</td>
                    <td className="n">{usr(r.usr)}</td>
                    <td className="n">{mode === "overall" ? delta(r.prevUsr === null ? null : r.usr - r.prevUsr) : r.appearances}</td>
                    <td className="n">{r.tournaments}</td>
                    <td>{r.lastCompetition ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={res.total} size={PAGE_SIZE} href={(p) => href({ page: String(p) })} />
    </>
  );
}
