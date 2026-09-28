import Link from "next/link";
import type { Metadata } from "next";
import { Avatar, Pager, teamLabel, usr } from "@/components/plain";
import { states } from "@/lib/queries/common";
import { teamDirectory } from "@/lib/queries/search";
import { tournamentFilters } from "@/lib/queries/tournaments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teams" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TeamsPage(props: PageProps<"/teams">) {
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ total, rows }, { seasons }, stateList] = await Promise.all([
    teamDirectory({
      division: one(sp.div) || undefined,
      season: Number(one(sp.season)) || undefined,
      state: one(sp.state) || undefined,
      page,
    }),
    tournamentFilters(),
    states(),
  ]);
  const qs = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "page" && one(v)).map(([k, v]) => [k, one(v)]));
  return (
    <>
      <h1>Teams</h1>
      <form action="/teams" className="filters">
        <select name="div" defaultValue={one(sp.div)} aria-label="Division">
          <option value="">All divisions</option>
          <option value="B">Division B</option>
          <option value="C">Division C</option>
        </select>
        <select name="season" defaultValue={one(sp.season)} aria-label="Season">
          <option value="">All seasons</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{String(s).slice(2)} season
            </option>
          ))}
        </select>
        <select name="state" defaultValue={one(sp.state)} aria-label="State">
          <option value="">All states</option>
          {stateList.map((s) => (
            <option key={s}>{s}</option>
          ))}
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
            {rows.map((r) => (
              <li key={String(r.id)} className="row">
                <Avatar name={String(r.name)} small />
                <span className="who">
                  <Link href={`/teams/${r.id}`}>
                    {String(r.name)} {teamLabel(String(r.designation))}
                  </Link>
                  <div className="sub">
                    {[r.city, r.state].filter(Boolean).map(String).join(", ")} · Division {String(r.division)} · {Number(r.season) - 1}-
                    {String(r.season).slice(2)}
                  </div>
                </span>
                <span className="pill">{r.rating ? usr(Number(String(r.rating).split("|")[0])) : "-"}</span>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} total={total} size={50} href={(p) => `/teams?${new URLSearchParams({ ...qs, page: String(p) })}`} />
      </section>
    </>
  );
}
