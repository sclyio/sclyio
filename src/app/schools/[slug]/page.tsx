import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar, RatingBadge, Tabs, teamLabel, usr } from "@/components/plain";
import { entityLabel } from "@/lib/queries/common";
import { detailSnapshotId, eventBreakdown, history, schoolProfile } from "@/lib/queries/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/schools/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await entityLabel("school", decodeURIComponent(slug));
  return { title: s ? s.schoolName : "School" };
}

export default async function SchoolPage(props: PageProps<"/schools/[slug]">) {
  const { slug } = await props.params;
  const id = decodeURIComponent(slug);
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const tab = sp.tab === "events" || sp.tab === "tournaments" ? sp.tab : "teams";
  const p = await schoolProfile(id);
  if (!p) notFound();
  const pools = p.potential;
  const chosen = pools.find((x) => `${x.division}-${x.season}` === sp.pool) ?? pools.find((x) => x.rating) ?? pools[0];
  const hist = chosen ? await history("school", id, chosen.division, chosen.season) : [];
  const events = chosen && tab === "events" ? await eventBreakdown("school", id, chosen.division, chosen.season, detailSnapshotId(hist)) : [];
  const r = chosen?.rating;
  const base = `/schools/${encodeURIComponent(id)}`;
  const q = (extra: string) => `${base}?${chosen ? `pool=${chosen.division}-${chosen.season}&` : ""}${extra}`;

  return (
    <>
      <section className="card">
        <div className="profile">
          <Avatar name={p.school.schoolName} />
          <div>
            <h1 className="profile-name">{p.school.schoolName}</h1>
            <div className="profile-sub">{[p.school.city, p.school.state].filter(Boolean).join(", ")}</div>
            <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
              {pools.map((x) => (
                <Link
                  key={`${x.division}-${x.season}`}
                  className={x === chosen ? "chip on" : "chip"}
                  href={`${base}?pool=${x.division}-${x.season}${tab !== "teams" ? `&tab=${tab}` : ""}`}
                >
                  Div {x.division} {x.season - 1}-{String(x.season).slice(2)}
                </Link>
              ))}
              {chosen ? (
                <Link className="chip" href={`/compare?view=school&div=${chosen.division}&season=${chosen.season}&ids=${encodeURIComponent(id)}`}>
                  Compare
                </Link>
              ) : null}
            </div>
          </div>
          <RatingBadge
            label="SCHOOL USR"
            value={r?.usr}
            coverage={r ? r.comparable_events / r.official_events : undefined}
            sub={r?.national_rank ? `#${r.national_rank} Division ${chosen!.division}` : r ? r.status : "Unrated"}
          />
        </div>
      </section>

      <Tabs
        active={tab}
        items={[
          { key: "teams", label: "Teams", href: q("") },
          { key: "events", label: "Events", href: q("tab=events") },
          { key: "tournaments", label: "Tournaments", href: q("tab=tournaments") },
        ]}
      />

      {tab === "teams" ? (
        <section className="card flush">
          <ul className="rows">
            {p.teams.map((t) => (
              <li key={t.id} className="row">
                <span className="who">
                  <Link href={`/teams/${t.id}`}>
                    {p.school.schoolName} {teamLabel(t.designation)}
                  </Link>
                  <div className="sub">
                    Division {t.division} · {t.season - 1}-{String(t.season).slice(2)} · {t.appearances} tournaments
                    {t.rating?.national_rank ? ` · #${t.rating.national_rank}` : ""}
                  </div>
                </span>
                <span className="pill">{usr(t.rating?.usr)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : tab === "events" ? (
        <section className="card flush scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th className="n">USR</th>
                <th className="n">Rank</th>
              </tr>
            </thead>
            <tbody>
              {events
                .filter((e) => !e.eventDefId.startsWith("other:"))
                .map((e) => (
                  <tr key={e.eventDefId}>
                    <td>{e.name}</td>
                    <td className="n">
                      <span className="pill">{usr(e.rating?.usr)}</span>
                    </td>
                    <td className="n muted">{e.rating?.eventRank ? `#${e.rating.eventRank} of ${e.rankedCount}` : "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card flush">
          <ul className="rows">
            {p.appearances.map((a) => (
              <li key={String(a.id)} className="row">
                <span className="who">
                  <Link href={`/tournaments/${a.id}`}>{String(a.name)}</Link>
                  <div className="sub">
                    {String(a.end_date)} · Division {String(a.division)} · {String(a.level)}
                  </div>
                </span>
                <span className="muted">
                  Best {a.best_rank ? String(a.best_rank) : "-"} of {String(a.field)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
