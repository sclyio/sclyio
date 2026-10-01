import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/account";
import { seasonLabel } from "@/components/plain";
import { requireAdmin } from "@/lib/accounts/actor";
import { AccessError } from "@/lib/accounts/errors";
import { adminRecords, adminSeasonSummary, type RecordFilters } from "@/lib/accounts/review";
import { requestCtx } from "@/lib/accounts/server";
import { isFreshAuthentication } from "@/lib/auth/policy";
import { csrfToken } from "@/lib/auth/session";
import { ReauthNotice, ReviewCard } from "../review-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "All seasons", robots: { index: false, follow: false } };

const STATUSES = ["SELF_REPORTED", "PENDING", "VERIFIED", "REJECTED", "REVOKED"];

export default async function Records(props: PageProps<"/admin/records">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const ctx = await requestCtx();
  const actor = await requireAdmin(ctx).catch((e) => {
    if (e instanceof AccessError) notFound();
    throw e;
  });
  const filters: RecordFilters = {
    status: sp.status === "any" || STATUSES.includes(sp.status ?? "") ? sp.status : "unverified",
    division: sp.division === "B" || sp.division === "C" ? sp.division : undefined,
    season: Number(sp.season) || undefined,
    q: sp.q?.slice(0, 80) || undefined,
    page: Math.max(1, Number(sp.page) || 1),
  };
  const [{ items, hasMore }, { seasons }] = await Promise.all([adminRecords(ctx, filters), adminSeasonSummary(ctx)]);
  const seasonOptions = [...new Set(seasons.map((s) => s.season))];
  const fresh = isFreshAuthentication(actor.authenticatedAt, ctx.now);
  const csrf = csrfToken(actor.sessionId);
  const params = (extra: Record<string, string | undefined>) =>
    new URLSearchParams(
      Object.entries({ ...sp, ...extra }).filter(([k, v]) => v && k !== "msg" && k !== "error") as [string, string][],
    ).toString();
  const here = `/admin/records?${params({})}`;

  return (
    <>
      <h1>All seasons</h1>
      <p className="muted">
        Every member affiliation and its claims, whether or not the member requested review. Verify past seasons&apos; results here; your own
        records are not listed.
      </p>
      <Flash sp={sp} />
      {!fresh ? <ReauthNotice here={here} /> : null}
      <form className="filters" action="/admin/records">
        <select name="season" defaultValue={filters.season ?? ""} aria-label="Season">
          <option value="">All seasons</option>
          {seasonOptions.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
            </option>
          ))}
        </select>
        <select name="division" defaultValue={filters.division ?? ""} aria-label="Division">
          <option value="">Both divisions</option>
          <option value="B">Division B</option>
          <option value="C">Division C</option>
        </select>
        <select name="status" defaultValue={filters.status} aria-label="Status">
          <option value="unverified">Needs review (self-reported or pending)</option>
          <option value="any">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              Has {s.toLowerCase().replace("_", " ")}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={filters.q ?? ""} placeholder="School or display name" aria-label="Search" />
        <button type="submit">Filter</button>
      </form>
      {items.length === 0 ? <p className="muted">No records match these filters.</p> : null}
      {items.map((item) => (
        <ReviewCard
          key={item.membership.id}
          user={item.user}
          membership={item.membership}
          membershipHistory={item.membershipHistory}
          claims={item.claims}
          meta={
            <>
              {item.claims.length} claim{item.claims.length === 1 ? "" : "s"}
              {item.openRequestId ? " · has an open review request" : ""}
            </>
          }
          csrf={csrf}
          back={here}
          disabled={!fresh}
        />
      ))}
      {filters.page! > 1 || hasMore ? (
        <nav className="pager" aria-label="Pages">
          {filters.page! > 1 ? <Link href={`/admin/records?${params({ page: String(filters.page! - 1) })}`}>← Previous</Link> : null}
          <span className="muted">Page {filters.page}</span>
          {hasMore ? <Link href={`/admin/records?${params({ page: String(filters.page! + 1) })}`}>Next →</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
