import Link from "next/link";
import type { Metadata } from "next";
import { AutoSubmitForm } from "@/components/client-bits";
import { EmptyState, Pagination, StatusBadge, cx, inputCls, selectCls } from "@/components/ui";
import { fmtUsr, seasonLabel, stateLabel } from "@/lib/format";
import { states } from "@/lib/queries/common";
import { teamDirectory } from "@/lib/queries/search";
import { tournamentFilters } from "@/lib/queries/tournaments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Teams" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TeamsPage(props: PageProps<"/teams">) {
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { total, rows } = await teamDirectory({
    q: one(sp.q) || undefined,
    division: one(sp.div) || undefined,
    season: Number(one(sp.season)) || undefined,
    state: one(sp.state) || undefined,
    page,
  });
  const [{ seasons }, stateList] = await Promise.all([tournamentFilters(), states()]);
  const qs = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "page" && one(v)).map(([k, v]) => [k, one(v)]));
  const lbl = "grid gap-1 text-xs font-medium text-ink-3";
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-3">
        Find your school, then choose your team. A team here is a school + division + season + team label (for example “Gold”). Entries whose
        label could not be determined are listed on the school page as unresolved.
      </p>
      <AutoSubmitForm action="/teams" className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-line bg-surface p-3">
        <label className={lbl}>
          School or city
          <span className="flex gap-1">
            <input type="search" name="q" defaultValue={one(sp.q)} placeholder="e.g. Troy" className={cx(inputCls, "w-56")} />
            <button className="rounded border border-line px-2.5 text-sm hover:border-cobalt">Go</button>
          </span>
        </label>
        <label className={lbl}>
          Division
          <select name="div" defaultValue={one(sp.div)} className={selectCls}>
            <option value="">B and C</option>
            <option value="B">Division B</option>
            <option value="C">Division C</option>
          </select>
        </label>
        <label className={lbl}>
          Season
          <select name="season" defaultValue={one(sp.season)} className={selectCls}>
            <option value="">All seasons</option>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          State
          <select name="state" defaultValue={one(sp.state)} className={selectCls}>
            <option value="">All states</option>
            {stateList.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </AutoSubmitForm>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <thead>
              <tr>
                <th>School</th>
                <th>Team</th>
                <th>Div.</th>
                <th>Season</th>
                <th className="hidden sm:table-cell">State</th>
                <th className="r">USR</th>
                <th className="hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [usr, status] = r.rating ? String(r.rating).split("|") : [null, null];
                return (
                  <tr key={String(r.id)}>
                    <td>
                      <Link className="link" href={`/schools/${r.school_id}`}>
                        {String(r.name)}
                      </Link>
                    </td>
                    <td>
                      <Link className="font-medium hover:text-cobalt hover:underline" href={`/teams/${r.id}`}>
                        {String(r.designation) || "Unlabeled team"}
                      </Link>
                    </td>
                    <td>{String(r.division)}</td>
                    <td className="num">{seasonLabel(Number(r.season))}</td>
                    <td className="hidden sm:table-cell">{stateLabel(String(r.state))}</td>
                    <td className="r num font-semibold">{usr ? fmtUsr(Number(usr)) : "—"}</td>
                    <td className="hidden md:table-cell">
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState title="No teams match">Try a shorter school name or clear the filters.</EmptyState>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={50} href={(p) => `/teams?${new URLSearchParams({ ...qs, page: String(p) })}`} />
    </div>
  );
}
