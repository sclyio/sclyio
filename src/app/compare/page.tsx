import Link from "next/link";
import type { Metadata } from "next";
import { Avatar, teamLabel, usr } from "@/components/plain";
import { seasonsFor } from "@/lib/queries/common";
import { compareCandidates, compareData } from "@/lib/queries/compare";
import type { RatingView } from "@/lib/rating/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ComparePage(props: PageProps<"/compare">) {
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const view: RatingView = one(sp.view) === "school" ? "school" : "team";
  const division = one(sp.div) === "B" ? "B" : "C";
  const seasons = await seasonsFor(division);
  const season = seasons.includes(Number(one(sp.season))) ? Number(one(sp.season)) : seasons[0];
  const ids = [...new Set(one(sp.ids).split(",").map((s) => s.trim()).filter(Boolean))];
  const q = one(sp.q);
  const [data, candidates] = await Promise.all([
    season ? compareData(view, division, season, ids) : Promise.resolve(null),
    season && q ? compareCandidates(view, division, season, q) : Promise.resolve([]),
  ]);
  const link = (nextIds: string[]) =>
    `/compare?${new URLSearchParams({ view, div: division, season: String(season ?? ""), ids: nextIds.join(",") })}`;
  const ents = data?.entities ?? [];
  const name = (i: number) =>
    view === "team" ? `${ents[i].label.schoolName} ${teamLabel(ents[i].label.designation)}`.trim() : ents[i].label.schoolName;

  return (
    <>
      <h1>Compare</h1>
      <form action="/compare" className="filters">
        <input type="hidden" name="ids" value={ids.join(",")} />
        <select name="view" defaultValue={view} aria-label="View">
          <option value="team">Teams</option>
          <option value="school">Schools</option>
        </select>
        <select name="div" defaultValue={division} aria-label="Division">
          <option value="C">Division C</option>
          <option value="B">Division B</option>
        </select>
        <select name="season" defaultValue={season} aria-label="Season">
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{String(s).slice(2)} season
            </option>
          ))}
        </select>
        <input name="q" defaultValue={q} size={24} placeholder={`Add a ${view === "team" ? "team" : "school"}`} aria-label="Add" />
        <button>Add</button>
      </form>

      {q ? (
        <section className="card flush">
          <ul className="rows">
            {candidates.length ? (
              candidates.map((c) => (
                <li key={c.id} className="row">
                  <Avatar name={c.name} small />
                  <span className="who">
                    {c.name} {view === "team" ? teamLabel(c.designation) : ""}
                    <div className="sub">{c.state}</div>
                  </span>
                  {ids.includes(c.id) ? (
                    <span className="muted">Added</span>
                  ) : ids.length >= 4 ? (
                    <span className="muted">Max 4</span>
                  ) : (
                    <Link className="chip" href={link([...ids, c.id])}>
                      Add
                    </Link>
                  )}
                </li>
              ))
            ) : (
              <li className="row muted">No matches.</li>
            )}
          </ul>
        </section>
      ) : null}

      {data?.errors.map((e) => (
        <p key={e} className="muted">
          {e}
        </p>
      ))}

      {ents.length < 2 ? (
        <p className="muted">Add two to four {view === "team" ? "teams" : "schools"} to compare.</p>
      ) : (
        <>
          <div className="grid2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))` }}>
            {ents.map((e, i) => (
              <section key={e.label.id} className="card" style={{ textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Avatar name={e.label.schoolName} />
                </div>
                <div style={{ fontWeight: 700, marginTop: 8 }}>
                  <Link href={view === "team" ? `/teams/${e.label.id}` : `/schools/${e.label.id}`}>{name(i)}</Link>
                </div>
                <div className="muted">{e.label.state}</div>
                <div className="badge-value" style={{ marginTop: 6 }}>
                  {usr(e.latest?.usr)}
                </div>
                <div className="muted">
                  {e.latest?.nationalRank ? `#${e.latest.nationalRank}` : "Unranked"} · {e.latest?.tournaments ?? 0} tournaments
                </div>
                <div style={{ marginTop: 8 }}>
                  <Link href={link(ids.filter((x) => x !== e.label.id))} className="muted">
                    Remove
                  </Link>
                </div>
              </section>
            ))}
          </div>

          <section className="card flush scroll">
            <div className="card-head">
              <h2 style={{ margin: 0 }}>Head to Head</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th className="n">Tournaments (W-L-T)</th>
                  <th className="n">Events (W-L-T)</th>
                </tr>
              </thead>
              <tbody>
                {data!.pairs.map((p) => {
                  const ia = ents.findIndex((e) => e.label.id === p.a);
                  const ib = ents.findIndex((e) => e.label.id === p.b);
                  return (
                    <tr key={p.a + p.b}>
                      <td>
                        {name(ia)} <span className="muted">vs</span> {name(ib)}
                      </td>
                      <td className="n">{p.overall.join("-")}</td>
                      <td className="n">{p.events.join("-")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card flush scroll">
            <div className="card-head">
              <h2 style={{ margin: 0 }}>Events</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  {ents.map((e, i) => (
                    <th key={e.label.id} className="n">
                      {name(i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data!.events.map((ev) => {
                  const vals = ents.map((e) => data!.eventRatings.get(e.label.id)?.get(ev.id)?.usr ?? null);
                  const best = Math.max(...vals.map((v) => v ?? -1));
                  return (
                    <tr key={ev.id}>
                      <td>{ev.name}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="n" style={v !== null && v === best ? { fontWeight: 800 } : undefined}>
                          {usr(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card flush scroll">
            <div className="card-head">
              <h2 style={{ margin: 0 }}>Common Tournaments</h2>
            </div>
            {data!.common.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Tournament</th>
                    {ents.map((e, i) => (
                      <th key={e.label.id} className="n">
                        {name(i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data!.common.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/tournaments/${t.id}`}>{t.name}</Link>
                        <div className="muted">{t.endDate}</div>
                      </td>
                      {ents.map((e) => {
                        const s = data!.standings.get(e.label.id)?.get(t.id);
                        return (
                          <td key={e.label.id} className="n">
                            {s ? `${s.rank ?? "-"} of ${s.field}` : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: 16 }} className="muted">
                No shared tournaments.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
