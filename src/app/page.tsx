import Link from "next/link";
import { teamLabel, usr } from "@/components/plain";
import { recentTournaments } from "@/lib/queries/coverage";
import { getRankings } from "@/lib/queries/rankings";

export const dynamic = "force-dynamic";

const top = (division: "B" | "C") =>
  getRankings({
    division,
    view: "team",
    mode: "overall",
    status: "established",
    sort: "rank",
    dir: "asc",
    page: 1,
    onePerSchool: false,
    period: "4w",
  });

export default async function Home() {
  const [c, b, recent] = await Promise.all([top("C"), top("B"), recentTournaments(10)]);
  return (
    <>
      <h1>scly.io</h1>
      <p>Science Olympiad team ratings.</p>
      <form action="/search">
        <input name="q" size={40} required minLength={2} placeholder="School or team" aria-label="Find your school or team" />{" "}
        <button>Search</button>
      </form>
      {[
        { d: "C", r: c },
        { d: "B", r: b },
      ].map(({ d, r }) => (
        <div key={d}>
          <h2>Division {d}</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>State</th>
                <th>USR</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.slice(0, 10).map((x) => (
                <tr key={x.entityId}>
                  <td className="n">{x.nationalRank}</td>
                  <td>
                    <Link href={`/teams/${x.entityId}`}>
                      {x.schoolName} {teamLabel(x.designation)}
                    </Link>
                  </td>
                  <td>{x.state}</td>
                  <td className="n">{usr(x.usr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href={`/rankings?div=${d}`}>More</Link>
        </div>
      ))}
      <h2>Recent tournaments</h2>
      <ul>
        {recent.map((t) => (
          <li key={t.id}>
            <Link href={`/tournaments/${t.id}`}>{t.name}</Link> ({t.division}, {t.end_date})
          </li>
        ))}
      </ul>
    </>
  );
}
