import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { delta, teamLabel, usr } from "@/components/plain";
import { STATUS_TEXT } from "@/lib/format";
import { officialEvents } from "@/lib/queries/common";
import { detailSnapshotId, eventBreakdown, history, teamAppearances, teamSeason } from "@/lib/queries/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/teams/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await teamSeason(decodeURIComponent(id));
  return { title: t ? `${t.schoolName} ${teamLabel(t.designation)}` : "Team" };
}

export default async function TeamPage(props: PageProps<"/teams/[id]">) {
  const { id: raw } = await props.params;
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
  const changes = rated.filter((h, i) => i === 0 || Math.abs((h.usr ?? 0) - (rated[i - 1].usr ?? 0)) >= 0.005);

  return (
    <>
      <h1>
        {t.schoolName} {teamLabel(t.designation)}
      </h1>
      <p>
        <Link href={`/schools/${t.schoolId}`}>{t.schoolName}</Link>, {t.state} &middot; Division {division} &middot; {season - 1}-{season}{" "}
        &middot; <Link href={`/compare?view=team&div=${division}&season=${season}&ids=${encodeURIComponent(id)}`}>Compare</Link>
      </p>
      <p>
        <b>USR {usr(latest?.usr)}</b>
        {latest?.nationalRank ? ` · #${latest.nationalRank} (${t.state} #${latest.stateRank})` : ` · ${latest?.status ?? "unrated"}`}
        {latest ? ` · ${latest.comparableEvents}/${official.length} events · ${latest.tournaments} tournaments` : ""}
      </p>

      <h2>Results</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Tournament</th>
              <th>Place</th>
              <th>Points</th>
              <th>USR before</th>
              <th>USR after</th>
            </tr>
          </thead>
          <tbody>
            {[...apps].reverse().map((a) => (
              <tr key={a.entryId}>
                <td>{a.endDate}</td>
                <td>
                  <Link href={`/tournaments/${a.tournamentId}`}>{a.tournamentName}</Link>
                </td>
                <td className="n">
                  {a.rank ?? "-"}/{a.fieldSize}
                </td>
                <td className="n">{a.points ?? "-"}</td>
                <td className="n">{usr(a.before?.usr)}</td>
                <td className="n">{usr(a.after?.usr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Events</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>USR</th>
              <th>Rank</th>
              <th>Results</th>
            </tr>
          </thead>
          <tbody>
            {events
              .filter((e) => !e.eventDefId.startsWith("other:"))
              .map((e) => (
                <tr key={e.eventDefId}>
                  <td>{e.name}</td>
                  <td className="n">{usr(e.rating?.usr)}</td>
                  <td className="n">{e.rating?.eventRank ? `${e.rating.eventRank}/${e.rankedCount}` : "-"}</td>
                  <td>{e.results.map((r) => (r.status === "placed" ? r.place : STATUS_TEXT[r.status] || r.status)).join(", ") || "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h2>History</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>USR</th>
              <th>Change</th>
              <th>New results</th>
            </tr>
          </thead>
          <tbody>
            {[...changes].reverse().map((h) => {
              const prev = rated[rated.indexOf(h) - 1];
              return (
                <tr key={h.asOf}>
                  <td>{h.asOf}</td>
                  <td className="n">{usr(h.usr)}</td>
                  <td className="n">{prev ? delta((h.usr ?? 0) - (prev.usr ?? 0)) : "new"}</td>
                  <td>{(h.explain?.t ?? []).map((x) => names.get(x) ?? x).join(", ") || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
