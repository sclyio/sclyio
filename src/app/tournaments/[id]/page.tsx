import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar, Tabs } from "@/components/plain";
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
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const tab = sp.tab === "events" ? "events" : "standings";
  const id = decodeURIComponent(raw);
  const d = await tournamentDetail(id);
  if (!d) notFound();
  const { t, events, entries, results } = d;
  const res = new Map(results.map((r) => [`${r.entry_id}|${r.tournament_event_id}`, r]));
  const base = `/tournaments/${encodeURIComponent(id)}`;

  return (
    <>
      <section className="card">
        <h1 className="profile-name">{String(t.name)}</h1>
        <div className="profile-sub">
          {String(t.start_date)}
          {t.end_date !== t.start_date ? ` – ${String(t.end_date)}` : ""} · {String(t.location ?? "")}
          {t.state ? `, ${String(t.state)}` : ""} · {String(t.level)} · Division {String(t.division)} · {entries.length} teams ·{" "}
          <a href={String(t.result_url)}>Source</a>
        </div>
      </section>

      <Tabs
        active={tab}
        items={[
          { key: "standings", label: "Standings", href: base },
          { key: "events", label: "Event Places", href: `${base}?tab=events` },
        ]}
      />

      {tab === "standings" ? (
        <section className="card flush">
          <ul className="rows">
            {entries.map((e) => (
              <li key={String(e.id)} className="row">
                <span className="rank">{e.rank ? String(e.rank) : "-"}</span>
                <Avatar name={String(e.school_name)} small />
                <span className="who">
                  {e.team_season_id ? (
                    <Link href={`/teams/${e.team_season_id}`}>
                      {String(e.school_name)} {String(e.raw_suffix ?? "")}
                    </Link>
                  ) : (
                    <Link href={`/schools/${e.school_id}`}>
                      {String(e.school_name)} {String(e.raw_suffix ?? "")}
                    </Link>
                  )}
                  <div className="sub">
                    {String(e.school_state)}
                    {e.exhibition ? " · exhibition" : ""}
                  </div>
                </span>
                <span className="pill">{e.points === null || e.points === undefined ? "-" : String(e.points)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card flush scroll">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                {events.map((e) => (
                  <th key={e.id} className="n" title={e.name}>
                    {e.name.length > 14 ? `${e.name.slice(0, 13)}…` : e.name}
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
        </section>
      )}
    </>
  );
}
