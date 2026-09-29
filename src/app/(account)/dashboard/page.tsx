import type { Metadata } from "next";
import Link from "next/link";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { PersonalRatingCard } from "@/components/personal";
import { SubmitButton } from "@/components/submit-button";
import { dashboard, type DashMembership } from "@/lib/accounts/dashboard";
import { pageUser } from "@/lib/accounts/server";
import type { ClaimEvidence } from "@/lib/personal/rating";
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
  const { actor, csrf, ctx } = await pageUser("/dashboard");
  const d = await dashboard(ctx);
  const evidence = new Map<string, ClaimEvidence>();
  for (const r of d.ratings) for (const c of r.view.snapshot?.claims ?? []) evidence.set(c.claimId, c);

  return (
    <>
      <h1>Your dashboard</h1>
      <p className="muted">
        Your <Link href={`/members/${actor.userId}`}>{actor.profilePrivate ? "private" : "public"} profile</Link>
        {actor.profilePrivate ? " is visible only to you." : " is visible to everyone."} Change this in <Link href="/settings/profile">Settings</Link>.
      </p>
      <Flash sp={sp} />
      {d.ratings.map((r) => (
        <PersonalRatingCard key={`${r.division}${r.season}`} division={r.division} season={r.season} view={r.view} own />
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
      {d.memberships.length ? (
        <p>
          <Link className="btn btn-quiet" href="/onboarding?add=1">
            Add another school or season
          </Link>
        </p>
      ) : null}
    </>
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
            {m.pendingRequest ? ` · verification requested ${m.pendingRequest.created_at.slice(0, 10)}` : ""}
          </div>
          {m.decisionReason ? <div style={{ fontSize: 13 }}>Admin note: {m.decisionReason}</div> : null}
        </div>
        <div className="actions-cell">
          <Link className="btn" href={`/dashboard/claims/new?m=${mem.id}`}>
              Add competition
            </Link>
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
