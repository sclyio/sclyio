import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { teamLabel, usr } from "@/components/plain";
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
  const p = await schoolProfile(id);
  if (!p) notFound();
  const pools = p.potential;
  const chosen = pools.find((x) => `${x.division}-${x.season}` === sp.pool) ?? pools.find((x) => x.rating) ?? pools[0];
  const hist = chosen ? await history("school", id, chosen.division, chosen.season) : [];
  const events = chosen ? await eventBreakdown("school", id, chosen.division, chosen.season, detailSnapshotId(hist)) : [];
  const r = chosen?.rating;

  return (
    <>
      <h1>{p.school.schoolName}</h1>
      <p>
        {[p.school.city, p.school.state].filter(Boolean).join(", ")}
        {chosen ? (
          <>
            {" "}
            &middot;{" "}
            <Link href={`/compare?view=school&div=${chosen.division}&season=${chosen.season}&ids=${encodeURIComponent(id)}`}>Compare</Link>
          </>
        ) : null}
      </p>

      <h2>Teams</h2>
      <table>
        <thead>
          <tr>
            <th>Season</th>
            <th>Div.</th>
            <th>Team</th>
            <th>USR</th>
            <th>Rank</th>
          </tr>
        </thead>
        <tbody>
          {p.teams.map((t) => (
            <tr key={t.id}>
              <td>
                {t.season - 1}-{t.season}
              </td>
              <td>{t.division}</td>
              <td>
                <Link href={`/teams/${t.id}`}>{teamLabel(t.designation)}</Link>
              </td>
              <td className="n">{usr(t.rating?.usr)}</td>
              <td className="n">{t.rating?.national_rank ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {chosen ? (
        <>
          <h2>
            School superscore, Division {chosen.division} {chosen.season - 1}-{chosen.season}
          </h2>
          {pools.length > 1 ? (
            <p>
              {pools.map((x, i) => (
                <span key={`${x.division}-${x.season}`}>
                  {i ? " | " : ""}
                  <Link href={`/schools/${id}?pool=${x.division}-${x.season}`}>
                    {x.division} {x.season - 1}-{x.season}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          <p>
            <b>USR {usr(r?.usr)}</b>
            {r?.national_rank ? ` · #${r.national_rank}` : r ? ` · ${r.status}` : ""}
          </p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>USR</th>
                  <th>Rank</th>
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
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h2>Tournaments</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Tournament</th>
              <th>Div.</th>
              <th>Best place</th>
            </tr>
          </thead>
          <tbody>
            {p.appearances.map((a) => (
              <tr key={String(a.id)}>
                <td>{String(a.end_date)}</td>
                <td>
                  <Link href={`/tournaments/${a.id}`}>{String(a.name)}</Link>
                </td>
                <td>{String(a.division)}</td>
                <td className="n">
                  {a.best_rank ? String(a.best_rank) : "-"}/{String(a.field)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
