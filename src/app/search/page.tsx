import Link from "next/link";
import type { Metadata } from "next";
import { Avatar, teamLabel, TournamentLink, usr } from "@/components/plain";
import { search } from "@/lib/queries/search";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const q = (sp.q ?? "").trim();
  const r = await search(q);
  const none = !r.schools.length && !r.teams.length && !r.tournaments.length;
  return (
    <>
      <h1>{q ? `Results for “${q}”` : "Search"}</h1>
      {q.length < 2 ? (
        <p className="muted">Use the search box at the top of the page.</p>
      ) : none ? (
        <p className="muted">No results.</p>
      ) : (
        <div className="grid2">
          <section className="card flush">
            <div className="card-head">
              <h2 style={{ margin: 0 }}>Teams</h2>
            </div>
            <ul className="rows">
              {r.teams.map((t) => (
                <li key={t.id} className="row">
                  <Avatar name={t.name} small />
                  <span className="who">
                    <Link href={`/teams/${t.id}`}>
                      {t.name} {teamLabel(t.designation)}
                    </Link>
                    <div className="sub">
                      {t.state} · Division {t.division} · {t.season - 1}-{String(t.season).slice(2)}
                    </div>
                  </span>
                  <span className="pill">{usr(t.usr)}</span>
                </li>
              ))}
            </ul>
          </section>
          <div>
            <section className="card flush">
              <div className="card-head">
                <h2 style={{ margin: 0 }}>Schools</h2>
              </div>
              <ul className="rows">
                {r.schools.map((s) => (
                  <li key={s.id} className="row">
                    <Avatar name={s.name} small />
                    <span className="who">
                      <Link href={`/schools/${s.id}`}>{s.name}</Link>
                      <div className="sub">{[s.city, s.state].filter(Boolean).join(", ")}</div>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card flush">
              <div className="card-head">
                <h2 style={{ margin: 0 }}>Tournaments</h2>
              </div>
              <ul className="rows">
                {r.tournaments.map((t) => (
                  <li key={t.id} className="row">
                    <span className="who">
                      <TournamentLink url={t.result_url} name={t.name} />
                      <div className="sub">
                        {t.end_date} · Division {t.division} · {t.level}
                      </div>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
