import Link from "next/link";
import type { Metadata } from "next";
import { Pager } from "@/components/plain";
import { listTournaments, T_PAGE, tournamentFilters } from "@/lib/queries/tournaments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tournaments" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TournamentsPage(props: PageProps<"/tournaments">) {
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [f, { total, rows }] = await Promise.all([
    tournamentFilters(),
    listTournaments({
      division: one(sp.div) || undefined,
      season: Number(one(sp.season)) || undefined,
      level: one(sp.level) || undefined,
      state: one(sp.state) || undefined,
      from: one(sp.from) || undefined,
      to: one(sp.to) || undefined,
      page,
    }),
  ]);
  const qs = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "page" && one(v)).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <h1>Tournaments</h1>
      <form action="/tournaments" className="filters">
        <select name="season" defaultValue={one(sp.season)} aria-label="Season">
          <option value="">All seasons</option>
          {f.seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{String(s).slice(2)} season
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
        <input type="date" name="from" defaultValue={one(sp.from)} aria-label="From" />
        <input type="date" name="to" defaultValue={one(sp.to)} aria-label="To" />
        <button>Apply</button>
      </form>
      <section className="card flush">
        {rows.length === 0 ? (
          <p style={{ padding: 16 }} className="muted">
            No results.
          </p>
        ) : (
          <ul className="rows">
            {rows.map((t) => (
              <li key={String(t.id)} className="row">
                <span className="who">
                  <Link href={`/tournaments/${t.id}`}>{String(t.name)}</Link>
                  <div className="sub">
                    {String(t.end_date)} · Division {String(t.division)} · {String(t.level)}
                    {t.state ? ` · ${String(t.state)}` : ""}
                  </div>
                </span>
                <span className="muted">{String(t.team_count)} teams</span>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} total={total} size={T_PAGE} href={(p) => `/tournaments?${new URLSearchParams({ ...qs, page: String(p) })}`} />
      </section>
    </>
  );
}
