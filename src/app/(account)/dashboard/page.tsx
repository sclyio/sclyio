import type { Metadata } from "next";
import Link from "next/link";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { usr } from "@/components/plain";
import { SubmitButton } from "@/components/submit-button";
import { dashboard, type DashMembership } from "@/lib/accounts/dashboard";
import { pageUser } from "@/lib/accounts/server";
import type { ClaimEvidence } from "@/lib/personal/rating";
import { PROVISIONAL_MIN_CLAIMS, PROVISIONAL_MIN_COMPETITIONS } from "@/lib/personal/rating";
import type { PersonalView } from "@/lib/personal/snapshots";
import { withdrawClaimAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

const OUTCOME_TEXT: Record<ClaimEvidence["outcome"], string> = {
  counted: "Counts",
  not_counted: "Not counted",
  no_eligible_result: "No eligible result",
  no_model_estimate: "No comparable model estimate",
  pending: "Rating calculation pending",
};

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { csrf, ctx } = await pageUser("/dashboard");
  const d = await dashboard(ctx);
  const evidence = new Map<string, ClaimEvidence>();
  for (const r of d.ratings) for (const c of r.view.snapshot?.claims ?? []) evidence.set(c.claimId, c);

  return (
    <>
      <h1>Your dashboard</h1>
      <Flash sp={sp} />
      {d.ratings.map((r) => (
        <PersonalCard key={`${r.division}${r.season}`} division={r.division} season={r.season} view={r.view} />
      ))}
      {d.memberships.length === 0 ? (
        <section className="card">
          <p>You have no school affiliation yet.</p>
          <Link className="btn" href="/onboarding?add=1">
            Add a school affiliation
          </Link>
        </section>
      ) : null}
      {d.memberships.map((m) => (
        <MembershipCard key={m.membership.id} m={m} csrf={csrf} evidence={evidence} />
      ))}
    </>
  );
}

function PersonalCard({ division, season, view }: { division: string; season: number; view: PersonalView }) {
  const s = view.snapshot;
  return (
    <section className="card" aria-labelledby={`pr-${division}${season}`}>
      <h2 id={`pr-${division}${season}`}>Unofficial USR · {divSeason(division, season)}</h2>
      <div className="personal">
        {view.pending ? (
          <div className="state-box" role="status">
            <b>Rating calculation pending</b>
            <div>{view.reason}</div>
          </div>
        ) : s!.state === "rated" ? (
          <div className="badge unofficial">
            <div className="badge-label">UNOFFICIAL USR</div>
            <div className="badge-value">{usr(s!.summaryUsr)}</div>
            <div className="badge-sub">
              based on {s!.ratedEvents} event{s!.ratedEvents === 1 ? "" : "s"} and {s!.competitions} competition{s!.competitions === 1 ? "" : "s"}
            </div>
            {s!.provisional ? <div className="badge-sub"><b>Provisional</b></div> : null}
          </div>
        ) : s!.state === "insufficient_comparable" ? (
          <div className="state-box">
            <b>No comparable model estimate</b>
            <div>Your rated events are not connected to the national comparison yet, so only local event estimates are shown.</div>
          </div>
        ) : (
          <div className="state-box">
            <b>No eligible result</b>
            <div>None of your counted claims has a rated official result yet. Nothing is shown rather than a default score.</div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <p style={{ marginTop: 0 }}>
            <b>Estimated from your claimed team-event results. It does not isolate your individual contribution.</b>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            It reflects only the events you selected, so it is not comparable to a school or team rating.
            {s ? (
              <>
                {" "}
                {s.verifiedContributingClaims} of {s.contributingClaims} contributing claim{s.contributingClaims === 1 ? " is" : "s are"} admin-verified; the
                rest are self-reported or pending.
              </>
            ) : null}
            {s?.provisional ? ` Provisional: fewer than ${PROVISIONAL_MIN_CLAIMS} comparable claims or ${PROVISIONAL_MIN_COMPETITIONS} competitions.` : ""}
          </p>
        </div>
      </div>
      {s && s.events.length ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th className="n">Estimate</th>
                <th className="n">Claims</th>
                <th className="n">Competitions</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {s.events.map((e) => (
                <tr key={e.eventDefId}>
                  <td>{e.name}</td>
                  <td className="n">{usr(e.usr)}</td>
                  <td className="n">{e.claims}</td>
                  <td className="n">{e.competitions}</td>
                  <td className="muted">{e.comparable ? "National" : "Local only (not in summary)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {s ? (
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Model {s.modelVersion} / {s.methodVersion}
          {s.ratingAsOf ? ` · field adjustments from the ${s.ratingAsOf} refit` : ""} · computed {s.computedAt.slice(0, 16).replace("T", " ")} UTC ·{" "}
          <Link href="/dashboard/method">How this is calculated</Link>
        </p>
      ) : null}
    </section>
  );
}

function MembershipCard({ m, csrf, evidence }: { m: DashMembership; csrf: string; evidence: Map<string, ClaimEvidence> }) {
  const mem = m.membership;
  const live = m.claims.filter((c) => c.claim.status !== "WITHDRAWN");
  const withdrawn = m.claims.length - live.length;
  return (
    <section className="card flush">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {mem.school_name} <StatusTag status={mem.status} subject="Affiliation" />
          </h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {divSeason(mem.division, mem.season)}
            {mem.starts_on ? ` · from ${mem.starts_on}` : ""}
            {mem.ends_on ? ` · until ${mem.ends_on}` : ""}
            {m.pendingRequest ? ` · verification requested ${m.pendingRequest.created_at.slice(0, 10)}` : ""}
          </div>
          {m.decisionReason ? <div style={{ fontSize: 13 }}>Admin note: {m.decisionReason}</div> : null}
        </div>
        <div className="actions-cell">
          {!mem.ends_on ? (
            <Link className="btn" href={`/dashboard/claims/new?m=${mem.id}`}>
              Add competition
            </Link>
          ) : null}
          <Link className="btn btn-quiet" href={`/dashboard/verify?m=${mem.id}`}>
            Request verification
          </Link>
        </div>
      </div>
      {live.length === 0 ? (
        <p className="muted" style={{ padding: "12px 16px", margin: 0 }}>
          No claimed competitions yet.{withdrawn ? ` (${withdrawn} withdrawn.)` : ""}
        </p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Competition</th>
                <th>Your team entry</th>
                <th>Event</th>
                <th>Official result</th>
                <th>Status</th>
                <th>Rating</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {live.map((c) => {
                const ev = evidence.get(c.claim.id);
                return (
                  <tr key={c.claim.id}>
                    <td>
                      {c.resultUrl ? (
                        <a href={c.resultUrl} target="_blank" rel="noopener noreferrer">
                          {c.tournamentName}
                        </a>
                      ) : (
                        c.tournamentName
                      )}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.tournamentDate}
                      </div>
                    </td>
                    <td>{c.entryText}</td>
                    <td>{c.eventName}</td>
                    <td>{c.resultText}</td>
                    <td>
                      <StatusTag status={c.claim.status} />
                      {c.claim.source_state === "changed" ? <div className="flag">Result corrected: awaiting re-review</div> : null}
                      {c.decisionReason ? <div style={{ fontSize: 12 }}>{c.decisionReason}</div> : null}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {ev ? OUTCOME_TEXT[ev.outcome] : "Rating calculation pending"}
                      {ev?.reason ? <div className="muted" style={{ fontSize: 12 }}>{ev.reason}</div> : null}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <Link className="btn btn-quiet" href={`/dashboard/claims/${c.claim.id}/edit`} aria-label={`Edit ${c.eventName} at ${c.tournamentName}`}>
                          Edit
                        </Link>
                        <form action={withdrawClaimAction}>
                          <Csrf token={csrf} />
                          <input type="hidden" name="claim" value={c.claim.id} />
                          <SubmitButton className="btn-danger" pending="…">
                            <span aria-label={`Withdraw ${c.eventName} at ${c.tournamentName}`}>Withdraw</span>
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
