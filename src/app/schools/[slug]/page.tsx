import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RatingHistoryChart } from "@/components/charts";
import { FollowButton } from "@/components/client-bits";
import { EventBreakdown } from "@/components/profile";
import { Badge, EmptyState, Initials, Panel, Section, StatusBadge, btnGhostCls } from "@/components/ui";
import { WhyChanged } from "@/components/why-changed";
import { fmtDate, fmtUsr, ordinal, seasonLabel, stateLabel } from "@/lib/format";
import { entityLabel, eventNames } from "@/lib/queries/common";
import { correctionsFor, detailSnapshotId, eventBreakdown, history, schoolProfile } from "@/lib/queries/profiles";

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
  const { school } = p;
  const pools = p.potential;
  const chosen = pools.find((x) => `${x.division}-${x.season}` === sp.pool) ?? pools.find((x) => x.rating) ?? pools[0];

  const hist = chosen ? await history("school", id, chosen.division, chosen.season) : [];
  const detailId = detailSnapshotId(hist);
  const breakdown = chosen ? await eventBreakdown("school", id, chosen.division, chosen.season, detailId) : [];
  const tNames = new Map(p.appearances.map((a) => [a.id as string, a.name as string]));
  const [corrections, names] = await Promise.all([correctionsFor([...tNames.keys()]), eventNames()]);
  const latest = [...hist].reverse().find((h) => h.usr !== null) ?? null;
  const seasons = [...new Set(p.teams.map((t) => t.season))];

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link className="link" href="/teams">
          Teams
        </Link>{" "}
        / {school.schoolName}
      </nav>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <Initials name={school.schoolName} size="lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{school.schoolName}</h1>
            <p className="mt-1 text-sm text-ink-2">{[school.city, stateLabel(school.state)].filter(Boolean).join(", ")}</p>
            <p className="mt-1 max-w-2xl text-xs text-ink-3">
              A school is identified by its name, city, and state as they appear in results. Schools with the same name in different places are
              kept separate unless a reviewed alias links them.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          {chosen ? (
            <Link href={`/compare?view=school&div=${chosen.division}&season=${chosen.season}&ids=${encodeURIComponent(id)}`} className={btnGhostCls}>
              Compare
            </Link>
          ) : null}
          <FollowButton item={{ id: `school:${id}`, href: `/schools/${id}`, label: school.schoolName, kind: "school" }} />
        </div>
      </header>

      <Section
        id="teams"
        title="Teams by season"
        description="Actual team entries, rated separately in Team Performance. Each season's teams are separate identities; rosters change between seasons."
      >
        {seasons.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {seasons.map((season) => (
              <Panel key={season} className="p-3">
                <h3 className="text-sm font-semibold">{seasonLabel(season)} season</h3>
                <div className="mt-1 overflow-x-auto">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Div.</th>
                      <th className="r">USR</th>
                      <th className="r">Rank</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.teams
                      .filter((t) => t.season === season)
                      .map((t) => (
                        <tr key={t.id}>
                          <td>
                            <Link className="link" href={`/teams/${t.id}`}>
                              {t.designation || "Unlabeled team"}
                            </Link>
                            <span className="ml-1 text-xs text-ink-3">{t.appearances} appearances</span>
                          </td>
                          <td>{t.division}</td>
                          <td className="r num font-semibold">{fmtUsr(t.rating?.usr)}</td>
                          <td className="r num">{t.rating?.national_rank ? `#${t.rating.national_rank}` : "—"}</td>
                          <td>
                            <StatusBadge status={t.rating?.status ?? null} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <EmptyState title="No resolved team entries">All of this school&apos;s appearances are unresolved (see below).</EmptyState>
        )}
      </Section>

      <Section
        id="potential"
        title="School Potential"
        description={
          <>
            A separately calculated rating: for every tournament and event, the school&apos;s best eligible finish across all its entries is kept and
            the unique schools are re-ranked. Its event superscore may not correspond to a feasible single roster, and it is not comparable with
            Team Performance numbers.
          </>
        }
        aside={
          pools.length > 1 ? (
            <nav aria-label="School Potential pool" className="flex flex-wrap gap-1 text-sm">
              {pools.map((x) => (
                <Link
                  key={`${x.division}-${x.season}`}
                  href={`/schools/${id}?pool=${x.division}-${x.season}#potential`}
                  aria-current={x === chosen ? "true" : undefined}
                  className={`rounded border px-2 py-1 ${x === chosen ? "border-cobalt bg-cobalt-soft text-cobalt-2" : "border-line bg-surface hover:border-cobalt"}`}
                >
                  Div {x.division} · {seasonLabel(x.season)}
                </Link>
              ))}
            </nav>
          ) : null
        }
      >
        {chosen && latest ? (
          <>
            <Panel className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-3">USR · School Potential · Div {chosen.division}</div>
                <div className="num text-5xl font-semibold tracking-tight">{fmtUsr(latest.usr)}</div>
                <StatusBadge status={latest.status} />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Potential rank</div>
                <div className="num mt-1 text-2xl font-semibold">{latest.nationalRank ? `#${latest.nationalRank}` : "—"}</div>
                <div className="text-xs text-ink-3">{latest.stateRank ? `${stateLabel(school.state)} #${latest.stateRank}` : "not established"}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Event coverage</div>
                <div className="num mt-1 text-2xl font-semibold">
                  {latest.comparableEvents}/{chosen.rating?.official_events ?? "—"}
                </div>
                <div className="text-xs text-ink-3">refit {fmtDate(latest.asOf)}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Eligible tournaments</div>
                <div className="num mt-1 text-2xl font-semibold">{latest.tournaments}</div>
                <div className="text-xs text-ink-3">may include prior-season equivalent events</div>
              </div>
            </Panel>
            <Panel className="mt-3 p-3">
              <RatingHistoryChart
                data={hist.map((h) => ({ asOf: h.asOf, usr: h.usr, events: (h.explain?.t ?? []).map((t) => tNames.get(t) ?? t) }))}
                label={`${school.schoolName} School Potential`}
              />
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-ink-2">Table view</summary>
                <table className="dtable mt-2">
                  <thead>
                    <tr>
                      <th>Refit</th>
                      <th className="r">USR</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.map((h) => (
                      <tr key={h.asOf}>
                        <td className="num">{h.asOf}</td>
                        <td className="r num">{fmtUsr(h.usr)}</td>
                        <td>{h.status ?? "no rating"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </Panel>
            <WhyChanged hist={hist} eventNames={names} tournamentNames={tNames} corrections={corrections} view="school" />
            <Section
              id="potential-events"
              title="School Potential by event"
              description="Potential-oriented event summaries (softplus generalized mean of field-adjusted results): strong results count for more than weak ones. The entry that supplied each superscored result is shown."
            >
              <EventBreakdown rows={breakdown} />
            </Section>
          </>
        ) : (
          <EmptyState title="No School Potential rating">No eligible official-event results in a rated season.</EmptyState>
        )}
      </Section>

      {p.unresolved.length ? (
        <Section
          id="unresolved"
          title="Unresolved appearances"
          description="Entries whose team identity could not be determined from the source (for example, an unlabeled entry when the school fielded several teams). They appear in official results and School Potential, but not in any Team Performance rating until a reviewed mapping is added."
        >
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tournament</th>
                  <th>Team #</th>
                  <th>Label</th>
                  <th className="r">Place</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {p.unresolved.map((u) => (
                  <tr key={u.id as string}>
                    <td className="num">{fmtDate(u.end_date as string)}</td>
                    <td>
                      <Link className="link" href={`/tournaments/${u.tournament_id}`}>
                        {u.name as string}
                      </Link>
                    </td>
                    <td className="num">{u.number as number}</td>
                    <td>{(u.raw_suffix as string) || <span className="text-ink-3">none</span>}</td>
                    <td className="r num">{u.rank ? ordinal(u.rank as number) : "—"}</td>
                    <td className="text-xs text-ink-3">{u.resolution_reason as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section id="appearances" title="Tournament appearances">
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="dtable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Tournament</th>
                <th>Div.</th>
                <th className="r">Entries</th>
                <th className="r">Best team finish</th>
              </tr>
            </thead>
            <tbody>
              {p.appearances.map((a) => (
                <tr key={a.id as string}>
                  <td className="num">{fmtDate(a.end_date as string)}</td>
                  <td>
                    <Link className="link" href={`/tournaments/${a.id}`}>
                      {a.name as string}
                    </Link>{" "}
                    <Badge>{a.level as string}</Badge>
                  </td>
                  <td>{a.division as string}</td>
                  <td className="r num">{a.entries as number}</td>
                  <td className="r num">
                    {a.best_rank ? ordinal(a.best_rank as number) : "—"}
                    <span className="text-ink-3"> / {a.field as number}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
