import type { Metadata } from "next";
import Link from "next/link";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { SubmitButton } from "@/components/submit-button";
import { canTransition, MAX_EXPLANATION } from "@/lib/accounts/claims";
import { dashboard } from "@/lib/accounts/dashboard";
import { pageUser } from "@/lib/accounts/server";
import { requestVerificationAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request verification", robots: { index: false } };

export default async function RequestVerification(props: PageProps<"/dashboard/verify">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { csrf, ctx } = await pageUser("/dashboard/verify");
  const d = await dashboard(ctx);
  const m = d.memberships.find((x) => x.membership.id === sp.m) ?? d.memberships[0];
  if (!m) {
    return (
      <section className="card">
        <p>
          You have no school affiliation yet. <Link href="/onboarding?add=1">Add one</Link>.
        </p>
      </section>
    );
  }
  const mem = m.membership;
  const canMembership = canTransition("request", mem.status);
  const claims = m.claims.filter((c) => canTransition("request", c.claim.status));
  const other = m.claims.filter((c) => c.claim.status === "PENDING" || c.claim.status === "VERIFIED");
  return (
    <>
      <h1>Request verification</h1>
      <Flash sp={sp} />
      <p className="note">
        The scly.io admin reviews requests by hand, using whatever information is available to them. Published results show how a team placed; they
        do not prove which students competed, so verification is a separate manual judgment. No identity documents are needed. Your claims keep
        counting toward your Unofficial USR while they are pending.
      </p>
      <form action={requestVerificationAction} className="card">
        <Csrf token={csrf} />
        <input type="hidden" name="membership" value={mem.id} />
        <input type="hidden" name="back" value={`/dashboard/verify?m=${mem.id}`} />
        <h2>
          {mem.school_name} · {divSeason(mem.division, mem.season)}
        </h2>
        <ul className="choice-list card" style={{ padding: 0 }}>
          <li>
            <label>
              <input type="checkbox" name="includeMembership" value="1" defaultChecked={canMembership} disabled={!canMembership} />
              <span>
                <b>School affiliation</b> <StatusTag status={mem.status} />
                <div className="sub">Confirms you were on {mem.school_name}&apos;s team this season.</div>
              </span>
            </label>
          </li>
          {claims.map((c) => (
            <li key={c.claim.id}>
              <label>
                <input type="checkbox" name="claim" value={c.claim.id} defaultChecked />
                <span>
                  <b>{c.eventName}</b> at {c.tournamentName} <StatusTag status={c.claim.status} />
                  <div className="sub">
                    {c.entryText} · official result: {c.resultText}
                  </div>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {other.length ? (
          <p className="muted" style={{ fontSize: 13 }}>
            {other.length} other claim{other.length === 1 ? " is" : "s are"} already pending or verified.
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="explanation">Optional note for the admin</label>
          <textarea id="explanation" name="explanation" rows={3} maxLength={MAX_EXPLANATION} />
          <span className="hint">Private: only you and the scly.io admin can see it. Up to {MAX_EXPLANATION} characters.</span>
        </div>
        {canMembership || claims.length ? (
          <SubmitButton pending="Sending…">Request verification</SubmitButton>
        ) : (
          <p className="muted">Nothing here can be submitted for review right now.</p>
        )}{" "}
        <Link href="/dashboard">Back to dashboard</Link>
      </form>
    </>
  );
}
