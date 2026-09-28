import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { STATUS_TEXT } from "@/lib/format";
import { tournamentDetail } from "@/lib/queries/tournaments";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/tournaments/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const d = await tournamentDetail(decodeURIComponent(id));
  return { title: d ? String(d.t.name) : "Tournament" };
}

export default async function TournamentPage(props: PageProps<"/tournaments/[id]">) {
  const { id: raw } = await props.params;
  const d = await tournamentDetail(decodeURIComponent(raw));
  if (!d) notFound();
  const { t, events, entries, results } = d;
  const res = new Map(results.map((r) => [`${r.entry_id}|${r.tournament_event_id}`, r]));

  return (
    <>
      <h1>{String(t.name)}</h1>
      <p>
        {String(t.start_date)}
        {t.end_date !== t.start_date ? ` to ${String(t.end_date)}` : ""} &middot; {String(t.location ?? "")}
        {t.state ? `, ${String(t.state)}` : ""} &middot; {String(t.level)} &middot; Division {String(t.division)} &middot;{" "}
        <a href={String(t.result_url)}>Source</a>
      </p>

      <h2>Standings</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Team</th>
              <th>State</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={String(e.id)}>
                <td className="n">{e.rank ? String(e.rank) : "-"}</td>
                <td>
                  <Link href={`/schools/${e.school_id}`}>{String(e.school_name)}</Link>{" "}
                  {e.team_season_id ? (
                    <Link href={`/teams/${e.team_season_id}`}>{String(e.raw_suffix ?? "") || "(team)"}</Link>
                  ) : (
                    String(e.raw_suffix ?? "")
                  )}
                  {e.exhibition ? " (exhibition)" : ""}
                </td>
                <td>{String(e.school_state)}</td>
                <td className="n">{e.points === null || e.points === undefined ? "-" : String(e.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Event places</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              {events.map((e) => (
                <th key={e.id}>
                  {e.name}
                  {e.trial || e.trialed ? " (T)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={String(e.id)}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {String(e.school_name)} {String(e.raw_suffix ?? "")}
                </td>
                {events.map((ev) => {
                  const r = res.get(`${e.id}|${ev.id}`);
                  return (
                    <td key={ev.id} className="n">
                      {!r ? "" : r.status === "placed" ? `${r.place}${r.tie ? "*" : ""}` : STATUS_TEXT[r.status] || r.status}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
