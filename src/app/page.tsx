import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { FollowingList } from "@/components/client-bits";
import { Badge, Panel } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtUsr, seasonLabel, stateLabel } from "@/lib/format";
import { coverage, recentlyAddedHistorical, recentTournaments } from "@/lib/queries/coverage";
import { getRankings } from "@/lib/queries/rankings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cov = await coverage();
  const previews = await Promise.all((["C", "B"] as const).map(async (division) => ({
    division,
    res: await getRankings({
      division,
      view: "team",
      mode: "overall",
      status: "established",
      sort: "rank",
      dir: "asc",
      page: 1,
      onePerSchool: false,
      period: "4w",
    }),
  })));
  const [recent, historical] = await Promise.all([recentTournaments(8), recentlyAddedHistorical(6)]);
  const totalT = cov.bySeason.reduce((a, b) => a + b.tournaments, 0);

  return (
    <div>
      <section className="grid grid-cols-1 gap-8 pt-4 pb-2 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Know where your team stands.</h1>
          <p className="mt-3 max-w-xl text-ink-2">
            scly.io rates Science Olympiad teams event by event from public tournament results, adjusts for the strength of each field, and
            shows every result behind the number. Division B and C, among{" "}
            <span className="num">{totalT.toLocaleString()}</span> indexed tournaments.
          </p>
          <form action="/search" role="search" className="mt-5 flex max-w-xl min-w-0 gap-2">
            <label htmlFor="home-q" className="sr-only">
              Find your school or team
            </label>
            <div className="relative w-full min-w-0">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-3" />
              <input
                id="home-q"
                name="q"
                type="search"
                required
                minLength={2}
                placeholder="Find your school or team"
                className="w-full min-w-0 rounded-md border border-line bg-surface py-3 pr-3 pl-10 text-base shadow-sm hover:border-ink-3"
              />
            </div>
            <button className="rounded-md bg-cobalt px-5 font-medium text-white hover:bg-cobalt-2">Search</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/rankings" className="inline-flex items-center gap-1 font-medium text-cobalt hover:underline">
              Browse rankings <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
            <Link href="/methodology" className="inline-flex items-center gap-1 font-medium text-cobalt hover:underline">
              How the rating works <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <Panel className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Dataset coverage</p>
          <dl className="mt-3 grid grid-cols-3 gap-4">
            <Cov label="Tournaments" v={totalT} />
            <Cov label="Schools" v={cov.counts.schools} />
            <Cov label="Team-seasons" v={cov.counts.teamSeasons} />
          </dl>
          <div className="mt-3 overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th>Season</th>
                <th>Div.</th>
                <th className="r">Tourn.</th>
                <th className="r">Entries</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody>
              {cov.bySeason.map((s) => (
                <tr key={`${s.season}${s.division}`}>
                  <td>{seasonLabel(s.season)}</td>
                  <td>{s.division}</td>
                  <td className="r num">{s.tournaments}</td>
                  <td className="r num">{s.entries.toLocaleString()}</td>
                  <td className="num text-xs text-ink-3">
                    {fmtDate(s.first, false)} – {fmtDate(s.last)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Last successful sync {fmtDateTime(cov.lastSync)} · source revision <span className="num">{(cov.sourceRevision ?? "").slice(0, 7)}</span>. Not a complete national
            database — only results published to Duosmium.{" "}
            <Link className="link" href="/data">
              Coverage details
            </Link>
          </p>
        </Panel>
      </section>

      <section aria-labelledby="following-h" className="mt-8">
        <h2 id="following-h" className="text-sm font-semibold text-ink-2">
          Following (this device)
        </h2>
        <div className="mt-2">
          <FollowingList />
        </div>
      </section>

      <section aria-labelledby="preview-h" className="mt-8">
        <div className="flex items-end justify-between">
          <h2 id="preview-h" className="text-lg font-semibold tracking-tight">
            Team Performance leaders
          </h2>
          <Link href="/rankings" className="text-sm font-medium text-cobalt hover:underline">
            Full rankings
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {previews.map(({ division, res }) => (
            <Panel key={division} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="font-medium">Division {division}</span>
                <span className="text-xs text-ink-3">
                  {res.season ? `${seasonLabel(res.season)} · refit ${fmtDate(res.snapshot?.as_of)}` : "no data"}
                </span>
              </div>
              <table className="dtable">
                <tbody>
                  {res.rows.slice(0, 10).map((r) => (
                    <tr key={r.entityId}>
                      <td className="num w-10 font-medium">{r.nationalRank}</td>
                      <td>
                        <Link href={`/teams/${r.entityId}`} className="font-medium hover:text-cobalt hover:underline">
                          {r.schoolName}
                        </Link>{" "}
                        <span className="text-ink-2">{r.designation || <i className="text-ink-3">unlabeled</i>}</span>
                      </td>
                      <td className="hidden text-ink-3 sm:table-cell">{stateLabel(r.state)}</td>
                      <td className="r num text-base font-semibold">{fmtUsr(r.usr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-line-2 px-3 py-2 text-right">
                <Link href={`/rankings?div=${division}`} className="text-sm text-cobalt hover:underline">
                  Division {division} rankings
                </Link>
              </div>
            </Panel>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          Established ratings only, among indexed teams. The {previews[0].res.season ? seasonLabel(previews[0].res.season) : ""} season is the latest
          with results; no {(previews[0].res.season ?? 0) + 1} season results have been published to the source yet.
        </p>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="text-lg font-semibold tracking-tight">
            Most recent tournaments
          </h2>
          <p className="text-xs text-ink-3">By competition date.</p>
          <ul className="mt-2 divide-y divide-line-2 rounded-md border border-line bg-surface text-sm">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link className="link" href={`/tournaments/${t.id}`}>
                  {t.name}
                </Link>
                <span className="shrink-0 text-xs text-ink-3">
                  Div {t.division} · {t.level} · {fmtDate(t.end_date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-semibold tracking-tight">
            Recently added historical results
          </h2>
          <p className="text-xs text-ink-3">Imported more than 60 days after the competition took place.</p>
          <ul className="mt-2 divide-y divide-line-2 rounded-md border border-line bg-surface text-sm">
            {historical.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link className="link" href={`/tournaments/${t.id}`}>
                  {t.name}
                </Link>
                <span className="shrink-0 text-xs text-ink-3">
                  held {fmtDate(t.end_date)} · added {fmtDate(t.first_imported_at)}
                </span>
              </li>
            ))}
          </ul>
          {historical.length ? (
            <p className="mt-1 text-xs text-ink-3">
              <Badge>Note</Badge> The whole archive was first imported at launch, so every result currently counts as a historical addition.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Cov({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num text-2xl font-semibold">{v.toLocaleString()}</dd>
    </div>
  );
}
