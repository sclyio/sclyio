import Link from "next/link";
import type { Metadata } from "next";
import { Badge, EmptyState, Initials, Section } from "@/components/ui";
import { fmtDate, fmtUsr, seasonLabel, stateLabel } from "@/lib/format";
import { search } from "@/lib/queries/search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const q = (sp.q ?? "").trim();
  const r = search(q);
  const none = !r.schools.length && !r.teams.length && !r.tournaments.length;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <form action="/search" role="search" className="mt-3 flex max-w-xl gap-2">
        <label htmlFor="sq" className="sr-only">
          Search
        </label>
        <input id="sq" name="q" defaultValue={q} required minLength={2} placeholder="School, city, or tournament" className="w-full rounded border border-line bg-surface px-3 py-2" />
        <button className="rounded bg-cobalt px-4 text-sm font-medium text-white hover:bg-cobalt-2">Search</button>
      </form>
      {q.length < 2 ? (
        <p className="mt-4 text-sm text-ink-3">Enter at least two characters.</p>
      ) : none ? (
        <div className="mt-5">
          <EmptyState title={`No results for “${q}”`}>
            Only schools and tournaments in imported Duosmium results are indexed. Try a shorter name, or check{" "}
            <Link className="link" href="/data">
              data coverage
            </Link>
            .
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-8">
          <div>
            <Section title={`Schools (${r.schools.length})`}>
              <ul className="divide-y divide-line-2 rounded-md border border-line bg-surface">
                {r.schools.map((s) => (
                  <li key={s.id}>
                    <Link href={`/schools/${s.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-bg">
                      <Initials name={s.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block font-medium">{s.name}</span>
                        <span className="text-xs text-ink-3">
                          {[s.city, stateLabel(s.state)].filter(Boolean).join(", ")} · {s.appearances} entries
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title={`Tournaments (${r.tournaments.length})`}>
              <ul className="divide-y divide-line-2 rounded-md border border-line bg-surface text-sm">
                {r.tournaments.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3 px-3 py-2">
                    <Link className="link" href={`/tournaments/${t.id}`}>
                      {t.name}
                    </Link>
                    <span className="shrink-0 text-xs text-ink-3">
                      Div {t.division} · {t.level} · {fmtDate(t.end_date)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
          <Section title={`Teams (${r.teams.length})`} description="Team identities are per season and division.">
            <ul className="divide-y divide-line-2 rounded-md border border-line bg-surface text-sm">
              {r.teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <Link className="link" href={`/teams/${t.id}`}>
                      {t.name} · {t.designation || "Unlabeled team"}
                    </Link>
                    <span className="ml-1 text-xs text-ink-3">
                      Div {t.division} · {seasonLabel(t.season)}
                    </span>
                  </span>
                  {t.usr !== null ? <span className="num font-semibold">{fmtUsr(t.usr)}</span> : <Badge>Unrated</Badge>}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}
