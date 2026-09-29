import type { Metadata } from "next";
import Link from "next/link";
import type { Client } from "@libsql/client";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { SubmitButton } from "@/components/submit-button";
import { memberships, type MembershipRow } from "@/lib/accounts/claims";
import { entryById, entryLabel, entryResults, resultText, schoolEntries, schoolTournaments, tournamentById, tournamentEvents } from "@/lib/accounts/dataset";
import { rows } from "@/lib/accounts/db";
import { dataSource, pageUser } from "@/lib/accounts/server";
import { addClaimsAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add competition", robots: { index: false } };

const STEPS = ["Tournament", "Team entry", "Events and results"];

/** Guided claim flow. Each step lives in the URL, so refreshing or going back never loses progress. */
export default async function AddCompetition(props: PageProps<"/dashboard/claims/new">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { actor, csrf, ctx } = await pageUser("/dashboard/claims/new");
  const ms = await memberships(ctx, actor.userId);
  const m = ms.find((x) => x.id === sp.m) ?? (ms.length === 1 ? ms[0] : null);
  const base = m ? `/dashboard/claims/new?m=${m.id}` : "/dashboard/claims/new";
  const step = !m ? 0 : !sp.t ? 1 : !sp.e ? 2 : 3;

  return (
    <>
      <h1>Add competition</h1>
      {m ? (
        <p className="muted">
          {m.school_name} · {divSeason(m.division, m.season)}
        </p>
      ) : null}
      <ol className="steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i + 1 === step ? "on" : i + 1 < step ? "done" : undefined} aria-current={i + 1 === step ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <Flash sp={sp} />
      {!m ? (
        <section className="card flush">
          <div className="card-head">
            <h2 style={{ margin: 0 }}>Which school affiliation?</h2>
          </div>
          {ms.length ? (
            <ul className="choice-list">
              {ms.map((x) => (
                <li key={x.id}>
                  <Link href={`/dashboard/claims/new?m=${x.id}`}>
                    <span>
                      <b>{x.school_name}</b> <StatusTag status={x.status} subject="Affiliation" />
                      <div className="sub">{divSeason(x.division, x.season)}</div>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ padding: 16 }}>
              Add a school affiliation first: <Link href="/onboarding?add=1">add affiliation</Link>.
            </p>
          )}
        </section>
      ) : step === 1 ? (
        <TournamentStep m={m} base={base} userId={actor.userId} db={ctx.db} />
      ) : step === 2 ? (
        <EntryStep m={m} base={base} tournamentId={sp.t!} />
      ) : (
        <EventStep m={m} base={base} tournamentId={sp.t!} entryId={sp.e!} csrf={csrf} userId={actor.userId} db={ctx.db} />
      )}
    </>
  );
}

async function TournamentStep({ m, base, userId, db }: { m: MembershipRow; base: string; userId: string; db: Client }) {
  const [list, counts] = await Promise.all([
    schoolTournaments(dataSource, m.school_id, m.division, m.season),
    rows<{ tournament_id: string; n: number }>(
      db,
      `SELECT tournament_id, COUNT(*) AS n FROM participation_claims WHERE user_id = ? AND status <> 'WITHDRAWN' GROUP BY tournament_id`,
      [userId],
    ),
  ]);
  const claimed = new Map(counts.map((r) => [r.tournament_id, r.n]));
  return (
    <section className="card flush">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>Choose a tournament you attended</h2>
      </div>
      {list.length ? (
        <ul className="choice-list">
          {list.map((t) => {
            const n = claimed.get(t.id);
            return (
              <li key={t.id}>
                <Link href={`${base}&t=${encodeURIComponent(t.id)}`}>
                  <span>
                    <b>{t.name}</b>
                    <div className="sub">
                      {t.start_date === t.end_date ? t.end_date : `${t.start_date} to ${t.end_date}`} · Division {t.division} · {t.level}
                      {n ? ` · ${n} event${n === 1 ? "" : "s"} already claimed` : ""}
                    </div>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ padding: 16 }} className="muted">
          No imported tournaments with an entry from {m.school_name} in this division and season.
        </p>
      )}
    </section>
  );
}

async function EntryStep({ m, base, tournamentId }: { m: MembershipRow; base: string; tournamentId: string }) {
  const t = await tournamentById(dataSource, tournamentId);
  if (!t || t.division !== m.division || t.season !== m.season) {
    return (
      <p className="flash error" role="alert">
        That tournament is not available for this affiliation. <Link href={base}>Choose again</Link>
      </p>
    );
  }
  const entries = await schoolEntries(dataSource, t.id, m.school_id);
  return (
    <section className="card flush">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>
          Which {m.school_name} team were you on at {t.name}?
        </h2>
      </div>
      <p className="muted" style={{ padding: "10px 16px 0", margin: 0, fontSize: 13 }}>
        Labels and team numbers are shown exactly as imported from the tournament&apos;s results.
      </p>
      {entries.length ? (
        <ul className="choice-list">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`${base}&t=${encodeURIComponent(t.id)}&e=${encodeURIComponent(e.id)}`}>
                <span>
                  <b>
                    {e.raw_school} {e.raw_suffix ?? ""}
                  </b>
                  <div className="sub">
                    {entryLabel(e)}
                    {e.rank ? ` · finished ${e.rank}` : ""}
                    {e.exhibition ? " · exhibition" : ""}
                  </div>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ padding: 16 }}>No {m.school_name} entries at this tournament.</p>
      )}
      <p style={{ padding: "0 16px 12px" }}>
        <Link href={base}>← Choose a different tournament</Link>
      </p>
    </section>
  );
}

async function EventStep(p: { m: MembershipRow; base: string; tournamentId: string; entryId: string; csrf: string; userId: string; db: Client }) {
  const [t, e] = await Promise.all([tournamentById(dataSource, p.tournamentId), entryById(dataSource, p.entryId)]);
  if (!t || !e || e.tournament_id !== t.id || e.school_id !== p.m.school_id || t.division !== p.m.division || t.season !== p.m.season) {
    return (
      <p className="flash error" role="alert">
        That team entry is not available for this affiliation. <Link href={p.base}>Start again</Link>
      </p>
    );
  }
  const [events, results, existing] = await Promise.all([
    tournamentEvents(dataSource, t.id),
    entryResults(dataSource, t.id, e.id),
    rows<{ tournament_event_id: string; status: string; entry_id: string }>(
      p.db,
      `SELECT tournament_event_id, status, entry_id FROM participation_claims WHERE user_id = ? AND tournament_id = ?`,
      [p.userId, t.id],
    ),
  ]);
  const res = new Map(results.map((r) => [r.tournament_event_id, r]));
  const mine = new Map(existing.filter((x) => x.status !== "WITHDRAWN").map((x) => [x.tournament_event_id, x]));
  const here = `${p.base}&t=${encodeURIComponent(t.id)}`;
  return (
    <form action={addClaimsAction} className="card flush">
      <Csrf token={p.csrf} />
      <input type="hidden" name="membership" value={p.m.id} />
      <input type="hidden" name="tournament" value={t.id} />
      <input type="hidden" name="entry" value={e.id} />
      <input type="hidden" name="back" value={`${here}&e=${encodeURIComponent(e.id)}`} />
      <div className="card-head" style={{ display: "block" }}>
        <h2 style={{ margin: 0 }}>Select the events you personally competed in</h2>
        <div className="muted" style={{ fontSize: 13 }}>
          <a href={t.result_url} target="_blank" rel="noopener noreferrer">
            {t.name}
          </a>{" "}
          · {t.end_date} · {e.raw_school} {entryLabel(e)}
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Events</legend>
        <ul className="choice-list">
          {events.map((ev) => {
            const r = res.get(ev.id);
            const taken = mine.get(ev.id);
            const note =
              ev.trial || ev.trialed
                ? "trial event: not rated"
                : ev.canceled || !ev.model_eligible
                  ? (ev.model_note ?? "not rated at this tournament")
                  : !r
                    ? "no official result: cannot contribute"
                    : null;
            return (
              <li key={ev.id}>
                <label>
                  <input type="checkbox" name="event" value={ev.id} disabled={Boolean(taken)} />
                  <span>
                    <b>{ev.name}</b>
                    <div className="sub">
                      Official result: {resultText(r)}
                      {note ? ` · ${note}` : ""}
                      {taken ? ` · already claimed${taken.entry_id === e.id ? "" : " on another team entry"}` : ""}
                    </div>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div style={{ padding: 16, borderTop: "1px solid var(--line)" }}>
        <p className="note">
          You are declaring that you competed in the selected events for this team entry. Each event becomes a separate claim. Claims count toward your
          Unofficial USR right away as self-reported; events without a rated result are stored but cannot contribute. You never enter scores or ratings.
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
          <input type="checkbox" name="declare" required style={{ marginTop: 3 }} />
          <span>I competed in the selected events for this team at this tournament.</span>
        </label>
        <SubmitButton pending="Submitting…">Submit claims</SubmitButton> <Link href={here}>← Different team entry</Link>
      </div>
    </form>
  );
}
