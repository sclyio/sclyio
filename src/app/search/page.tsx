import Link from "next/link";
import type { Metadata } from "next";
import { teamLabel, usr } from "@/components/plain";
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
      <h1>Search</h1>
      <form action="/search">
        <input name="q" defaultValue={q} size={40} required minLength={2} aria-label="Search" /> <button>Search</button>
      </form>
      {q.length < 2 ? null : none ? (
        <p>No results.</p>
      ) : (
        <>
          <h2>Schools</h2>
          <ul>
            {r.schools.map((s) => (
              <li key={s.id}>
                <Link href={`/schools/${s.id}`}>{s.name}</Link> ({[s.city, s.state].filter(Boolean).join(", ")})
              </li>
            ))}
          </ul>
          <h2>Teams</h2>
          <ul>
            {r.teams.map((t) => (
              <li key={t.id}>
                <Link href={`/teams/${t.id}`}>
                  {t.name} {teamLabel(t.designation)}
                </Link>{" "}
                (Div {t.division}, {t.season - 1}-{t.season}) {t.usr !== null ? usr(t.usr) : ""}
              </li>
            ))}
          </ul>
          <h2>Tournaments</h2>
          <ul>
            {r.tournaments.map((t) => (
              <li key={t.id}>
                <Link href={`/tournaments/${t.id}`}>{t.name}</Link> ({t.division}, {t.end_date})
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
