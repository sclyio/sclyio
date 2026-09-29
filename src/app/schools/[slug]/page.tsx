import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { VerifiedIcon } from "@/components/account";
import { Avatar, RatingBadge, seasonLabel, seasonRange, Tabs, teamLabel, TournamentLink, usr } from "@/components/plain";
import { RatingHistory } from "@/components/rating-history";
import { accountsDb, ensureAccountsSchema } from "@/lib/accounts/db";
import { schoolMembers, type SchoolMember } from "@/lib/accounts/public";
import { entityLabel } from "@/lib/queries/common";
import { detailSnapshotId, eventBreakdown, history, schoolHistory, schoolProfile } from "@/lib/queries/profiles";

export const dynamic = "force-dynamic";

const TABS = ["teams", "events", "tournaments", "history", "members"] as const;

export async function generateMetadata(props: PageProps<"/schools/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await entityLabel("school", decodeURIComponent(slug));
  return { title: s ? s.schoolName : "School" };
}

export default async function SchoolPage(props: PageProps<"/schools/[slug]">) {
  const { slug } = await props.params;
  const id = decodeURIComponent(slug);
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "teams";
  const p = await schoolProfile(id);
  if (!p) notFound();
  const pools = p.potential;
  const chosen = pools.find((x) => `${x.division}-${x.season}` === sp.pool) ?? pools.find((x) => x.rating) ?? pools[0];
  const hist = chosen ? await history("school", id, chosen.division, chosen.season) : [];
  const [events, divisionHist, members] = await Promise.all([
    chosen && tab === "events" ? eventBreakdown("school", id, chosen.division, chosen.season, detailSnapshotId(hist)) : Promise.resolve([]),
    chosen && tab === "history" ? schoolHistory(id, chosen.division) : Promise.resolve([]),
    tab === "members" ? ensureAccountsSchema().then(() => schoolMembers(accountsDb(), id)).catch(() => null) : Promise.resolve(null),
  ]);
  const r = chosen?.rating;
  const latest = [...hist].reverse().find((h) => h.usr !== null) ?? null;
  const base = `/schools/${encodeURIComponent(id)}`;
  const q = (extra: string) => `${base}?${chosen ? `pool=${chosen.division}-${chosen.season}&` : ""}${extra}`;
  const names = new Map(p.appearances.map((a) => [String(a.id), String(a.name)]));

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
            </div>
          </div>
          <div className="badges">
            <RatingBadge
              label="SCHOOL USR"
              value={r?.usr}
              coverage={r ? r.comparable_events / r.official_events : undefined}
              sub={r?.national_rank ? `#${r.national_rank} Division ${chosen!.division}` : r ? r.status : "Unrated"}
            />
            <RatingBadge label="SEASON TREND" value={latest?.trendUsr} sub={chosen ? seasonLabel(chosen.season) : undefined} trend />
          </div>
        </div>
      </section>

      <Tabs
        active={tab}
        items={[
          { key: "teams", label: "Teams", href: q("") },
          { key: "events", label: "Events", href: q("tab=events") },
          { key: "tournaments", label: "Tournaments", href: q("tab=tournaments") },
          { key: "history", label: "Rating History", href: q("tab=history") },
          { key: "members", label: "Members", href: q("tab=members") },
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
                    Division {t.division} · {seasonRange(t.first_season, t.season)} · {t.appearances} tournaments
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
      ) : tab === "history" ? (
        <RatingHistory
          hist={divisionHist}
          names={names}
          label={`${p.school.schoolName} Division ${chosen?.division ?? ""}`}
          more={Number(sp.more) || 0}
          moreHref={(n) => q(`tab=history&more=${n}`)}
        />
      ) : tab === "members" ? (
        <Members members={members} />
      ) : (
        <section className="card flush">
          <ul className="rows">
            {p.appearances.map((a) => (
              <li key={String(a.id)} className="row">
                <span className="who">
                  <TournamentLink url={String(a.result_url)} name={String(a.name)} />
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

function Members({ members }: { members: { members: SchoolMember[]; privateCount: number } | null }) {
  if (!members) return <p className="muted">Members are temporarily unavailable.</p>;
  const groups = new Map<string, SchoolMember[]>();
  for (const m of members.members) {
    const k = `${m.season}|${m.division}`;
    let arr = groups.get(k);
    if (!arr) groups.set(k, (arr = []));
    arr.push(m);
  }
  return (
    <>
      <p className="muted" style={{ fontSize: 13 }}>
        Members who added this school to their scly.io profile. <VerifiedIcon verified /> = affiliation verified by the scly.io admin;{" "}
        <VerifiedIcon verified={false} /> = self-reported.
      </p>
      {groups.size === 0 ? <p className="muted">No public members yet.</p> : null}
      {[...groups.entries()].map(([k, list]) => {
        const [season, division] = k.split("|");
        return (
          <section key={k} className="card flush">
            <div className="card-head">
              <h2 style={{ margin: 0 }}>
                {seasonLabel(Number(season))} · Division {division}
              </h2>
              <span className="muted">{list.length}</span>
            </div>
            <ul className="rows">
              {list.map((m) => (
                <li key={m.userId} className="row">
                  <span className="who">
                    <Link href={`/members/${m.userId}`}>{m.displayName}</Link>
                    <VerifiedIcon verified={m.verified} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {members.privateCount ? (
        <p className="muted" style={{ fontSize: 13 }}>
          {members.privateCount} more member{members.privateCount === 1 ? " has" : "s have"} a private profile.
        </p>
      ) : null}
    </>
  );
}
