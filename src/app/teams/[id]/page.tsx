import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar, Change, RatingBadge, Tabs, teamLabel, usr } from "@/components/plain";
import { STATUS_TEXT } from "@/lib/format";
import { officialEvents } from "@/lib/queries/common";
import { detailSnapshotId, eventBreakdown, history, teamAppearances, teamSeason } from "@/lib/queries/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/teams/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await teamSeason(decodeURIComponent(id));
  return { title: t ? `${t.schoolName} ${teamLabel(t.designation)}`.trim() : "Team" };
}

export default async function TeamPage(props: PageProps<"/teams/[id]">) {
  const { id: raw } = await props.params;
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const tab = sp.tab === "events" || sp.tab === "history" ? sp.tab : "results";
  const id = decodeURIComponent(raw);
  const t = await teamSeason(id);
  if (!t) notFound();
  const division = t.division!;
  const season = t.season!;
  const hist = await history("team", id, division, season);
  const rated = hist.filter((h) => h.usr !== null);
  const latest = rated.length ? rated[rated.length - 1] : null;
  const [apps, events, official] = await Promise.all([
    teamAppearances(id, hist),
    eventBreakdown("team", id, division, season, detailSnapshotId(hist)),
    officialEvents(division, season),
  ]);
  const names = new Map(apps.map((a) => [a.tournamentId, a.tournamentName]));
  const M = official.length;
  const base = `/teams/${encodeURIComponent(id)}`;

  return (
    <>
      <section className="card">
        <div className="profile">
          <Avatar name={t.schoolName} />
          <div>
            <h1 className="profile-name">
              {t.schoolName} {teamLabel(t.designation)}
            </h1>
            <div className="profile-sub">
              <Link href={`/schools/${t.schoolId}`}>{t.schoolName}</Link> · {[t.city, t.state].filter(Boolean).join(", ")} · Division {division} ·{" "}
              {season - 1}-{String(season).slice(2)}
            </div>
            <div style={{ marginTop: 10 }}>
              <Link className="chip" href={`/compare?view=team&div=${division}&season=${season}&ids=${encodeURIComponent(id)}`}>
                Compare
              </Link>
            </div>
          </div>
          <RatingBadge
            label="USR"
            value={latest?.usr}
            coverage={latest && M ? latest.comparableEvents! / M : undefined}
            sub={latest?.status === "established" ? "Ranked" : latest?.status ? latest.status[0].toUpperCase() + latest.status.slice(1) : "Unrated"}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <span className="stat">
            <b>{latest?.nationalRank ? `#${latest.nationalRank}` : "-"}</b>
            <span>National</span>
          </span>
          <span className="stat">
            <b>{latest?.stateRank ? `#${latest.stateRank}` : "-"}</b>
            <span>{t.state}</span>
          </span>
          <span className="stat">
            <b>
              {latest?.comparableEvents ?? 0}/{M}
            </b>
            <span>Events</span>
          </span>
          <span className="stat">
            <b>{apps.length}</b>
            <span>Tournaments</span>
          </span>
        </div>
      </section>

      <Tabs
        active={tab}
        items={[
          { key: "results", label: "Results", href: base },
          { key: "events", label: "Events", href: `${base}?tab=events` },
          { key: "history", label: "Rating History", href: `${base}?tab=history` },
        ]}
      />

      {tab === "results" ? (
        [...apps].reverse().map((a) => (
          <section key={a.entryId} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <Link href={`/tournaments/${a.tournamentId}`} style={{ fontWeight: 700 }}>
                  {a.tournamentName}
                </Link>
                <div className="muted">
                  {a.endDate} · {a.level}
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <span className="stat" style={{ margin: 0 }}>
                  <b>{a.rank ? `${a.rank}` : "-"}</b>
                  <span>of {a.fieldSize}</span>
                </span>
                <span className="stat" style={{ margin: 0 }}>
                  <b>{a.points ?? "-"}</b>
                  <span>points</span>
                </span>
                <span className="stat" style={{ margin: 0 }}>
                  <b>
                    {usr(a.before?.usr)} → {usr(a.after?.usr)}
                  </b>
                  <span>USR</span>
                </span>
              </div>
            </div>
          </section>
        ))
      ) : tab === "events" ? (
        <section className="card flush scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th className="n">USR</th>
                <th className="n">Rank</th>
                <th>Places</th>
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
                    <td className="muted">{e.results.map((r) => (r.status === "placed" ? r.place : STATUS_TEXT[r.status] || r.status)).join(", ") || "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="card flush scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="n">USR</th>
                <th className="n">Change</th>
                <th>New results</th>
              </tr>
            </thead>
            <tbody>
              {[...rated].reverse().map((h, i, arr) => {
                const prev = arr[i + 1];
                return (
                  <tr key={h.asOf}>
                    <td>{h.asOf}</td>
                    <td className="n">
                      <span className="pill">{usr(h.usr)}</span>
                    </td>
                    <td className="n">{prev ? <Change v={(h.usr ?? 0) - (prev.usr ?? 0)} /> : <span className="muted">first</span>}</td>
                    <td className="muted">{(h.explain?.t ?? []).map((x) => names.get(x) ?? x).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
