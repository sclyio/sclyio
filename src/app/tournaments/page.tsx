import type { Metadata } from "next";
import { Pager, seasonLabel } from "@/components/plain";
import { listTournaments, T_PAGE, tournamentFilters } from "@/lib/queries/tournaments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tournaments" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TournamentsPage(props: PageProps<"/tournaments">) {
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const f = await tournamentFilters();
  // Default to the latest season; "all" lists every season.
  const seasonParam = one(sp.season);
  const season = seasonParam === "all" ? undefined : Number(seasonParam) || f.seasons[0];
  const sort = one(sp.sort) === "date" ? "date" : "weight";
  const { total, rows } = await listTournaments({
    sort,
    division: one(sp.div) || undefined,
    season,
    level: one(sp.level) || undefined,
    state: one(sp.state) || undefined,
    page,
  });
  const qs = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "page" && one(v)).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <h1>Tournaments</h1>
      <form action="/tournaments" className="filters">
        <select name="season" defaultValue={season ? String(season) : "all"} aria-label="Season">
          <option value="all">All seasons</option>
          {f.seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)} season
            </option>
          ))}
        </select>
        <select name="div" defaultValue={one(sp.div)} aria-label="Division">
          <option value="">All divisions</option>
          <option value="B">Division B</option>
          <option value="C">Division C</option>
        </select>
        <select name="level" defaultValue={one(sp.level)} aria-label="Level">
          <option value="">All levels</option>
          {f.levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select name="state" defaultValue={one(sp.state)} aria-label="State">
          <option value="">All states</option>
          {f.states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort by">
          <option value="weight">Sort by weight</option>
          <option value="date">Sort by date</option>
        </select>
        <button>Apply</button>
      </form>
      <section className="card flush">
        {rows.length === 0 ? (
          <p style={{ padding: 16 }} className="muted">
            No results.
          </p>
        ) : (
          <ul className="rows">
            <li className="row head">
              {sort === "weight" ? <span className="rank">#</span> : null}
              <span className="who">Tournament</span>
              <span className="col col-usr">Weight</span>
            </li>
            {rows.map((t, i) => (
              <li key={String(t.id)} className="row">
                {sort === "weight" ? <span className="rank">{t.weight === null ? "-" : (page - 1) * T_PAGE + i + 1}</span> : null}
                <span className="who">
                  <a href={String(t.result_url)} target="_blank" rel="noopener noreferrer">
                    {String(t.name)}
                  </a>
                  <div className="sub">
                    {String(t.end_date)} · Division {String(t.division)} · {String(t.level)}
                    {t.format === "online" ? " · Online" : ""}
                    {t.state ? ` · ${String(t.state)}` : ""} · {String(t.team_count)} teams
                  </div>
                </span>
                <span className="col col-usr">
                  <span className="pill">{t.weight === null ? "-" : Number(t.weight).toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} total={total} size={T_PAGE} href={(p) => `/tournaments?${new URLSearchParams({ ...qs, page: String(p) })}`} />
      </section>
    </>
  );
}
