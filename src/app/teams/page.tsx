import Link from "next/link";
import type { Metadata } from "next";
import { Pager, teamLabel, usr } from "@/components/plain";
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
      q: one(sp.q) || undefined,
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
      <form action="/teams">
        <input name="q" defaultValue={one(sp.q)} size={24} placeholder="School or city" aria-label="School or city" />{" "}
        <select name="div" defaultValue={one(sp.div)} aria-label="Division">
          <option value="">B and C</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>{" "}
        <select name="season" defaultValue={one(sp.season)} aria-label="Season">
          <option value="">All seasons</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{s}
            </option>
          ))}
        </select>{" "}
        <select name="state" defaultValue={one(sp.state)} aria-label="State">
          <option value="">All states</option>
          {stateList.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>{" "}
        <button>Go</button>
      </form>
      {rows.length === 0 ? (
        <p>No results.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Team</th>
                <th>Div.</th>
                <th>Season</th>
                <th>State</th>
                <th>USR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td>
                    <Link href={`/schools/${r.school_id}`}>{String(r.name)}</Link>
                  </td>
                  <td>
                    <Link href={`/teams/${r.id}`}>{teamLabel(String(r.designation))}</Link>
                  </td>
                  <td>{String(r.division)}</td>
                  <td>
                    {Number(r.season) - 1}-{String(r.season)}
                  </td>
                  <td>{String(r.state)}</td>
                  <td className="n">{r.rating ? usr(Number(String(r.rating).split("|")[0])) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={total} size={50} href={(p) => `/teams?${new URLSearchParams({ ...qs, page: String(p) })}`} />
    </>
  );
}
