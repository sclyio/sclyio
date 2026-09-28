import Link from "next/link";
import { Avatar, Change, teamLabel, usr } from "@/components/plain";
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
  const [c, b, recent] = await Promise.all([top("C"), top("B"), recentTournaments(8)]);
  return (
    <>
      <div className="grid2">
        {[
          { d: "C", r: c },
          { d: "B", r: b },
        ].map(({ d, r }) => (
          <section key={d} className="card flush">
            <div className="card-head">
              <h2 style={{ margin: 0 }}>Top Division {d} Teams</h2>
              <Link href={`/rankings?div=${d}`}>See all</Link>
            </div>
            <ul className="rows">
              {r.rows.slice(0, 10).map((x) => (
                <li key={x.entityId} className="row">
                  <span className="rank">{x.nationalRank}</span>
                  <Avatar name={x.schoolName} small />
                  <span className="who">
                    <Link href={`/teams/${x.entityId}`}>
                      {x.schoolName} {teamLabel(x.designation)}
                    </Link>
                    <div className="sub">{x.state}</div>
                  </span>
                  <Change v={x.prevUsr === null ? null : x.usr - x.prevUsr} />
                  <span className="pill">{usr(x.usr)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="card flush">
        <div className="card-head">
          <h2 style={{ margin: 0 }}>Recent Tournaments</h2>
          <Link href="/tournaments">See all</Link>
        </div>
        <ul className="rows">
          {recent.map((t) => (
            <li key={t.id} className="row">
              <span className="who">
                <Link href={`/tournaments/${t.id}`}>{t.name}</Link>
                <div className="sub">
                  Division {t.division} · {t.level} · {t.end_date}
                </div>
              </span>
              <span className="muted">{t.team_count} teams</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
