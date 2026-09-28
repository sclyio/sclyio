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
      q: one(sp.q) || undefined,
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
      <form action="/tournaments">
        <select name="season" defaultValue={one(sp.season)} aria-label="Season">
          <option value="">All seasons</option>
          {f.seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{s}
            </option>
          ))}
        </select>{" "}
        <select name="div" defaultValue={one(sp.div)} aria-label="Division">
          <option value="">B and C</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>{" "}
        <select name="level" defaultValue={one(sp.level)} aria-label="Level">
          <option value="">Any level</option>
          {f.levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>{" "}
        <select name="state" defaultValue={one(sp.state)} aria-label="State">
          <option value="">Any state</option>
          {f.states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>{" "}
        <input type="date" name="from" defaultValue={one(sp.from)} aria-label="From" /> to{" "}
        <input type="date" name="to" defaultValue={one(sp.to)} aria-label="To" />{" "}
        <input name="q" defaultValue={one(sp.q)} size={16} placeholder="Name" aria-label="Name" /> <button>Go</button>
      </form>
      {rows.length === 0 ? (
        <p>No results.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tournament</th>
                <th>Div.</th>
                <th>Level</th>
                <th>State</th>
                <th>Teams</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={String(t.id)}>
                  <td>{String(t.end_date)}</td>
                  <td>
                    <Link href={`/tournaments/${t.id}`}>{String(t.name)}</Link>
                  </td>
                  <td>{String(t.division)}</td>
                  <td>{String(t.level)}</td>
                  <td>{String(t.state ?? "")}</td>
                  <td className="n">{String(t.team_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={total} size={T_PAGE} href={(p) => `/tournaments?${new URLSearchParams({ ...qs, page: String(p) })}`} />
    </>
  );
}
