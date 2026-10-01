import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flash } from "@/components/account";
import { requireAdmin } from "@/lib/accounts/actor";
import { AccessError } from "@/lib/accounts/errors";
import { adminQueue, type QueueFilters } from "@/lib/accounts/review";
import { requestCtx } from "@/lib/accounts/server";
import { isFreshAuthentication } from "@/lib/auth/policy";
import { csrfToken } from "@/lib/auth/session";
import { ReauthNotice, ReviewCard } from "../review-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request queue", robots: { index: false, follow: false } };

const STATUSES = ["PENDING", "VERIFIED", "REJECTED", "REVOKED", "SELF_REPORTED"];

export default async function Verifications(props: PageProps<"/admin/verifications">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const ctx = await requestCtx();
  // Authorization is re-checked on every load; anyone else gets a plain 404.
  const actor = await requireAdmin(ctx).catch((e) => {
    if (e instanceof AccessError) notFound();
    throw e;
  });
  const filters: QueueFilters = {
    state: sp.state === "closed" || sp.state === "all" ? sp.state : "open",
    claimStatus: STATUSES.includes(sp.status ?? "") ? sp.status : undefined,
    division: sp.division === "B" || sp.division === "C" ? sp.division : undefined,
    season: Number(sp.season) || undefined,
    q: sp.q?.slice(0, 80) || undefined,
  };
  const queue = await adminQueue(ctx, filters);
  const fresh = isFreshAuthentication(actor.authenticatedAt, ctx.now);
  const csrf = csrfToken(actor.sessionId);
  const here = `/admin/verifications?${new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "msg" && k !== "error") as [string, string][])}`;

  return (
    <>
      <h1>Request queue</h1>
      <p className="muted">Submissions members sent for review. To verify records nobody submitted, including past seasons, use All seasons.</p>
      <Flash sp={sp} />
      {!fresh ? <ReauthNotice here={here} /> : null}
      <form className="filters" action="/admin/verifications">
        <select name="state" defaultValue={filters.state} aria-label="Submission state">
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
        <select name="status" defaultValue={filters.claimStatus ?? ""} aria-label="Claim status">
          <option value="">Any claim status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase().replace("_", " ")}
            </option>
          ))}
        </select>
        <select name="division" defaultValue={filters.division ?? ""} aria-label="Division">
          <option value="">Both divisions</option>
          <option value="B">Division B</option>
          <option value="C">Division C</option>
        </select>
        <input name="season" type="number" defaultValue={filters.season ?? ""} placeholder="Season (e.g. 2026)" aria-label="Season" min={2000} max={2100} />
        <input name="q" defaultValue={filters.q ?? ""} placeholder="School or display name" aria-label="Search" />
        <button type="submit">Filter</button>
      </form>
      {queue.length === 0 ? <p className="muted">No submissions match these filters.</p> : null}
      {queue.map((item) => (
        <ReviewCard
          key={item.request.id}
          user={item.user}
          membership={item.membership}
          membershipHistory={item.membershipHistory}
          claims={item.claims}
          meta={
            <>
              submitted {item.request.created_at.slice(0, 16).replace("T", " ")} UTC
              {item.request.closed_at ? ` · closed ${item.request.closed_at.slice(0, 10)}` : " · open"}
            </>
          }
          note={item.request.explanation ? <p className="note" style={{ margin: "8px 0 0" }}>User&apos;s note (private): {item.request.explanation}</p> : null}
          membershipNote={item.request.include_membership ? undefined : "not included in this request"}
          csrf={csrf}
          back={here}
          disabled={!fresh}
        />
      ))}
    </>
  );
}
