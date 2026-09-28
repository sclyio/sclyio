import Link from "next/link";
import type { Metadata } from "next";
import { AutoSubmitForm } from "@/components/client-bits";
import { Badge, EmptyState, Pagination, cx, inputCls, selectCls } from "@/components/ui";
import { fmtDate, fmtUsr, seasonLabel, stateLabel } from "@/lib/format";
import { listTournaments, T_PAGE, tournamentFilters } from "@/lib/queries/tournaments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tournaments" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TournamentsPage(props: PageProps<"/tournaments">) {
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const f = tournamentFilters();
  const { total, rows } = listTournaments({
    q: one(sp.q) || undefined,
    division: one(sp.div) || undefined,
    season: Number(one(sp.season)) || undefined,
    level: one(sp.level) || undefined,
    state: one(sp.state) || undefined,
    from: one(sp.from) || undefined,
    to: one(sp.to) || undefined,
    page,
  });
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (one(v) && k !== "page") qs.set(k, one(v));
  const lbl = "grid gap-1 text-xs font-medium text-ink-3";
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Tournaments</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-3">
        Every imported Division B and C tournament, with official standings as published in the Duosmium archive. Field strength uses only
        ratings from before each tournament began.
      </p>
      <AutoSubmitForm action="/tournaments" className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-line bg-surface p-3">
        <label className={lbl}>
          Season
          <select name="season" defaultValue={one(sp.season)} className={selectCls}>
            <option value="">All seasons</option>
            {f.seasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
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
          Level
          <select name="level" defaultValue={one(sp.level)} className={selectCls}>
            <option value="">Any level</option>
            {f.levels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          Location (state)
          <select name="state" defaultValue={one(sp.state)} className={selectCls}>
            <option value="">Anywhere</option>
            {f.states.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          From
          <input type="date" name="from" defaultValue={one(sp.from)} className={inputCls} />
        </label>
        <label className={lbl}>
          To
          <input type="date" name="to" defaultValue={one(sp.to)} className={inputCls} />
        </label>
        <label className={lbl}>
          Search
          <span className="flex gap-1">
            <input type="search" name="q" defaultValue={one(sp.q)} placeholder="Tournament name" className={cx(inputCls, "w-48")} />
            <button className="rounded border border-line px-2.5 text-sm hover:border-cobalt">Go</button>
          </span>
        </label>
      </AutoSubmitForm>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No tournaments match these filters">
            <Link className="link" href="/tournaments">
              Clear filters
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Tournament</th>
                <th>Div.</th>
                <th className="hidden sm:table-cell">Level</th>
                <th className="hidden md:table-cell">State</th>
                <th className="r">Teams</th>
                <th className="r hidden md:table-cell" title="Mean pre-tournament USR of established Team Performance entrants">
                  Field (pre)
                </th>
                <th className="hidden lg:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id as string}>
                  <td className="num whitespace-nowrap">{fmtDate(t.end_date as string)}</td>
                  <td className="min-w-[14rem]">
                    <Link className="font-medium text-ink hover:text-cobalt hover:underline" href={`/tournaments/${t.id}`}>
                      {t.name as string}
                    </Link>
                  </td>
                  <td>{t.division as string}</td>
                  <td className="hidden sm:table-cell">{t.level as string}</td>
                  <td className="hidden md:table-cell">{stateLabel(t.state as string)}</td>
                  <td className="r num">{t.team_count as number}</td>
                  <td className="r num hidden md:table-cell">
                    {t.mean_usr !== null && t.mean_usr !== undefined ? (
                      <>
                        {fmtUsr(t.mean_usr as number)}
                        <span className="text-xs text-ink-3">
                          {" "}
                          ({t.established as number}/{t.fs_entries as number})
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-ink-3">insufficient</span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell">
                    {t.rating_eligible ? <Badge tone="lime">Rated</Badge> : <Badge tone="amber" title={t.exclusion_reason as string}>{t.preliminary ? "Preliminary" : "Not rated"}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={T_PAGE} href={(p) => `/tournaments?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(p) })}`} />
    </div>
  );
}
