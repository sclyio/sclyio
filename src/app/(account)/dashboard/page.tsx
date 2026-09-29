import type { Metadata } from "next";
import Link from "next/link";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { RatingBadge, seasonLabel } from "@/components/plain";
import { SubmitButton } from "@/components/submit-button";
import { dashboard, type DashMembership } from "@/lib/accounts/dashboard";
import { pageUser } from "@/lib/accounts/server";
import type { ClaimEvidence } from "@/lib/personal/rating";
import { withdrawClaimAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { actor, csrf, ctx } = await pageUser("/dashboard");
  const d = await dashboard(ctx);
  const evidence = new Map<string, ClaimEvidence>();
  for (const r of d.ratings) for (const c of r.view.snapshot?.claims ?? []) evidence.set(c.claimId, c);

  return (
    <>
      <h1>Dashboard</h1>
      <div className="actions-cell" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
        <Link className="btn" href="/dashboard/claims/new">
          Add competition
        </Link>
        <Link className="btn btn-quiet" href="/onboarding?add=1">
          Add season
        </Link>
        <Link className="btn btn-quiet" href="/dashboard/verify">
          Request verification
        </Link>
        <Link className="btn btn-quiet" href={`/members/${actor.userId}`}>
          View profile{actor.profilePrivate ? " (private)" : ""}
        </Link>
      </div>
      <Flash sp={sp} />

      {d.ratings.length ? (
        <section className="card">
          <div className="badges" style={{ marginLeft: 0 }}>
            {d.ratings.map((r) => {
              const s = r.view.snapshot;
              const ok = !r.view.pending && s?.state === "rated";
              return (
                <div key={`${r.division}${r.season}`} style={{ display: "flex", gap: 10 }}>
                  <RatingBadge
                    label={`USR · ${r.division} ${seasonLabel(r.season)}`}
                    value={ok ? s!.summaryUsr : null}
                    sub={r.view.pending ? "calculating" : !ok ? "no rated events" : s!.provisional ? "provisional" : "unofficial"}
                  />
                  <RatingBadge label="SEASON TREND" value={ok && s!.trendState === "rated" ? s!.trendUsr : null} trend />
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
            Estimated from your claimed team-event results; it does not isolate your individual contribution.
          </p>
        </section>
      ) : null}

      {d.memberships.length === 0 ? (
        <section className="card">
          <p style={{ marginTop: 0 }}>Add your school to get started.</p>
          <Link className="btn" href="/onboarding?add=1">
            Add season
          </Link>
        </section>
      ) : null}
      {d.memberships.map((m) => (
        <MembershipCard key={m.membership.id} m={m} csrf={csrf} evidence={evidence} />
      ))}
    </>
  );
}

function MembershipCard({ m, csrf, evidence }: { m: DashMembership; csrf: string; evidence: Map<string, ClaimEvidence> }) {
  const mem = m.membership;
  const live = m.claims.filter((c) => c.claim.status !== "WITHDRAWN");
  return (
    <section className="card flush">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          {mem.school_name} <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {divSeason(mem.division, mem.season)}</span>{" "}
          <StatusTag status={mem.status} />
        </h2>
        <Link href={`/dashboard/claims/new?m=${mem.id}`}>+ Add competition</Link>
      </div>
      {m.decisionReason && (mem.status === "REJECTED" || mem.status === "REVOKED") ? (
        <p className="muted" style={{ fontSize: 13, margin: 0, padding: "8px 16px 0" }}>
          Admin: {m.decisionReason}
        </p>
      ) : null}
      {live.length === 0 ? (
        <p className="muted" style={{ padding: "12px 16px", margin: 0 }}>
          No competitions yet.
        </p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Event</th>
                <th>Result</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {live.map((c) => {
                const ev = evidence.get(c.claim.id);
                const notRated = ev && ev.outcome !== "counted";
                return (
                  <tr key={c.claim.id}>
                    <td>
                      {c.tournamentName}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.tournamentDate}
                      </div>
                    </td>
                    <td>
                      {c.eventName}
                      {notRated ? (
                        <div className="muted" style={{ fontSize: 12 }} title={ev.reason ?? undefined}>
                          not rated
                        </div>
                      ) : null}
                    </td>
                    <td>{c.resultText}</td>
                    <td>
                      <StatusTag status={c.claim.status} />
                      {c.decisionReason && (c.claim.status === "REJECTED" || c.claim.status === "REVOKED") ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {c.decisionReason}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <Link href={`/dashboard/claims/${c.claim.id}/edit`} aria-label={`Edit ${c.eventName} at ${c.tournamentName}`}>
                          Edit
                        </Link>
                        <form action={withdrawClaimAction}>
                          <Csrf token={csrf} />
                          <input type="hidden" name="claim" value={c.claim.id} />
                          <SubmitButton className="btn-link" pending="…">
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
