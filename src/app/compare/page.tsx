import Link from "next/link";
import type { Metadata } from "next";
import { teamLabel, usr } from "@/components/plain";
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
  const name = (i: number) => (view === "team" ? `${ents[i].label.schoolName} ${teamLabel(ents[i].label.designation)}` : ents[i].label.schoolName);

  return (
    <>
      <h1>Compare</h1>
      <form action="/compare">
        <input type="hidden" name="ids" value={ids.join(",")} />
        <select name="view" defaultValue={view} aria-label="View">
          <option value="team">Teams</option>
          <option value="school">Schools (superscore)</option>
        </select>{" "}
        <select name="div" defaultValue={division} aria-label="Division">
          <option value="C">Division C</option>
          <option value="B">Division B</option>
        </select>{" "}
        <select name="season" defaultValue={season} aria-label="Season">
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s - 1}-{s}
            </option>
          ))}
        </select>{" "}
        <input name="q" defaultValue={q} size={20} placeholder="Add a team or school" aria-label="Add" /> <button>Find</button>
      </form>

      {q ? (
        <p>
          {candidates.length
            ? candidates.map((c, i) => (
                <span key={c.id}>
                  {i ? " | " : ""}
                  {ids.includes(c.id) || ids.length >= 4 ? (
                    `${c.name} ${view === "team" ? teamLabel(c.designation) : ""}`
                  ) : (
                    <Link href={link([...ids, c.id])}>
                      + {c.name} {view === "team" ? teamLabel(c.designation) : ""}
                    </Link>
                  )}
                </span>
              ))
            : "No matches."}
        </p>
      ) : null}

      {data?.errors.map((e) => (
        <p key={e}>{e}</p>
      ))}

      {ents.length < 2 ? (
        <p>Add two to four {view === "team" ? "teams" : "schools"}.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>{view === "team" ? "Team" : "School"}</th>
                <th>USR</th>
                <th>Rank</th>
                <th>Tournaments</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ents.map((e, i) => (
                <tr key={e.label.id}>
                  <td>
                    <Link href={view === "team" ? `/teams/${e.label.id}` : `/schools/${e.label.id}`}>{name(i)}</Link>
                  </td>
                  <td className="n">{usr(e.latest?.usr)}</td>
                  <td className="n">{e.latest?.nationalRank ?? "-"}</td>
                  <td className="n">{e.latest?.tournaments ?? 0}</td>
                  <td>
                    <Link href={link(ids.filter((x) => x !== e.label.id))}>remove</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Head to head</h2>
          <table>
            <thead>
              <tr>
                <th>Pair</th>
                <th>Overall (W-L-T)</th>
                <th>Events (W-L-T)</th>
              </tr>
            </thead>
            <tbody>
              {data!.pairs.map((p) => {
                const ia = ents.findIndex((e) => e.label.id === p.a);
                const ib = ents.findIndex((e) => e.label.id === p.b);
                return (
                  <tr key={p.a + p.b}>
                    <td>
                      {name(ia)} vs {name(ib)}
                    </td>
                    <td className="n">{p.overall.join("-")}</td>
                    <td className="n">{p.events.join("-")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h2>Events</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  {ents.map((e, i) => (
                    <th key={e.label.id}>{name(i)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data!.events.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.name}</td>
                    {ents.map((e) => (
                      <td key={e.label.id} className="n">
                        {usr(data!.eventRatings.get(e.label.id)?.get(ev.id)?.usr)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Common tournaments</h2>
          {data!.common.length ? (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tournament</th>
                    {ents.map((e, i) => (
                      <th key={e.label.id}>{name(i)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data!.common.map((t) => (
                    <tr key={t.id}>
                      <td>{t.endDate}</td>
                      <td>
                        <Link href={`/tournaments/${t.id}`}>{t.name}</Link>
                      </td>
                      {ents.map((e) => {
                        const s = data!.standings.get(e.label.id)?.get(t.id);
                        return (
                          <td key={e.label.id} className="n">
                            {s ? `${s.rank ?? "-"}/${s.field}` : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No shared tournaments.</p>
          )}
        </>
      )}
    </>
  );
}
