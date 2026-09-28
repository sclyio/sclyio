import Link from "next/link";
import { HeroArt } from "@/components/hero-art";
import { Avatar, Change, teamLabel, TournamentLink, usr } from "@/components/plain";
import { kv } from "@/lib/queries/common";
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

const fmt = (n: number | undefined) => (n === undefined ? null : n.toLocaleString("en-US"));

export default async function Home() {
  const [c, b, recent, countsRaw] = await Promise.all([top("C"), top("B"), recentTournaments(8), kv("site_counts")]);
  let counts: { teams?: number; schools?: number; entries?: number } = {};
  try {
    counts = countsRaw ? JSON.parse(countsRaw) : {};
  } catch {
    counts = {};
  }
  const stats = [
    { value: fmt(counts.schools), label: "schools" },
    { value: fmt(counts.teams), label: "teams" },
    { value: fmt(counts.entries), label: "tournament entries" },
  ].filter((s) => s.value);
  return (
    <>
      <section className="hero">
        <HeroArt />
        <h1 className="hero-title">
          Universal Science Olympiad Rating
        </h1>
        <p className="hero-byline">by cyclommatus.metallifer</p>
        {stats.length ? (
          <div className="hero-stats">
            {stats.map((s) => (
              <span key={s.label}>
                <b>{s.value}</b> {s.label}
              </span>
            ))}
          </div>
        ) : null}
      </section>

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
                <TournamentLink url={t.result_url} name={t.name} />
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
