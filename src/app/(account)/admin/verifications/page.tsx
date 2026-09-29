import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Csrf, divSeason, Flash, StatusTag } from "@/components/account";
import { seasonLabel } from "@/components/plain";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/accounts/actor";
import { AccessError } from "@/lib/accounts/errors";
import { adminQueue, type HistoryItem, type QueueFilters, type QueueItem } from "@/lib/accounts/review";
import { requestCtx } from "@/lib/accounts/server";
import { ADMIN_REAUTH_WINDOW_MS, isFreshAuthentication } from "@/lib/auth/policy";
import { csrfToken } from "@/lib/auth/session";
import { decideSubmissionAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verifications", robots: { index: false, follow: false } };

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
      <h1>Verification queue</h1>
      <Flash sp={sp} />
      {!fresh ? (
        <p className="flash error" role="alert">
          Decisions need a Google sign-in within the last {ADMIN_REAUTH_WINDOW_MS / 60000} minutes.{" "}
          <a href={`/auth/google/start?reauth=1&returnTo=${encodeURIComponent(here)}`}>Sign in again</a>
        </p>
      ) : null}
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
        <Submission key={item.request.id} item={item} csrf={csrf} back={here} disabled={!fresh} />
      ))}
    </>
  );
}

function History({ items }: { items: HistoryItem[] }) {
  if (!items.length) return null;
  return (
    <details>
      <summary style={{ fontSize: 12, cursor: "pointer" }}>Review history ({items.length})</summary>
      <ul className="history">
        {items.map((h, i) => (
          <li key={i}>
            {h.at.slice(0, 16).replace("T", " ")} · {h.action}
            {h.revision ? ` · rev ${h.revision}` : ""}
            {h.fromStatus || h.toStatus ? ` · ${h.fromStatus ?? ""} → ${h.toStatus ?? ""}` : ""}
            {h.actor ? ` · ${h.actor}` : ""}
            {h.publicReason ? ` · user sees: “${h.publicReason}”` : ""}
            {h.privateNote ? <span className="private"> · private: “{h.privateNote}”</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function DecisionFields({ prefix, id, revision, status, disabled }: { prefix: string; id: string; revision: number; status: string; disabled: boolean }) {
  const options =
    status === "PENDING"
      ? [
          ["VERIFIED", "Verify"],
          ["REJECTED", "Reject"],
        ]
      : status === "VERIFIED"
        ? [["REVOKED", "Revoke"]]
        : [];
  if (!options.length) return null;
  return (
    <div className="decision">
      <input type="hidden" name={`${prefix}:${id}:revision`} value={revision} />
      <select name={`${prefix}:${id}:decision`} defaultValue="skip" disabled={disabled} aria-label="Decision">
        <option value="skip">No decision</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <input name={`${prefix}:${id}:reason`} maxLength={1000} placeholder="Reason shown to the user (required to reject/revoke)" disabled={disabled} aria-label="Reason shown to the user" />
      <input name={`${prefix}:${id}:note`} maxLength={1000} placeholder="Private admin note" disabled={disabled} aria-label="Private admin note" />
    </div>
  );
}

function Submission({ item, csrf, back, disabled }: { item: QueueItem; csrf: string; back: string; disabled: boolean }) {
  const m = item.membership;
  return (
    <form action={decideSubmissionAction} className="card flush">
      <Csrf token={csrf} />
      <input type="hidden" name="back" value={back} />
      <div className="card-head" style={{ display: "block" }}>
        <h2 style={{ margin: 0 }}>
          {item.user.displayName ?? "(no display name)"} · {m.school_name}
        </h2>
        <div className="muted" style={{ fontSize: 13 }}>
          {divSeason(m.division, m.season)} · submitted {item.request.created_at.slice(0, 16).replace("T", " ")} UTC
          {item.request.closed_at ? ` · closed ${item.request.closed_at.slice(0, 10)}` : " · open"}
        </div>
        {item.request.explanation ? <p className="note" style={{ margin: "8px 0 0" }}>User&apos;s note (private): {item.request.explanation}</p> : null}
      </div>
      <div className="review-item">
        <input type="hidden" name="membership" value={m.id} />
        <b>School affiliation</b> <StatusTag status={m.status} /> <span className="muted">rev {m.revision}</span>
        <div className="muted" style={{ fontSize: 13 }}>
          {m.school_name}, Division {m.division}, {seasonLabel(m.season)}
          {item.request.include_membership ? "" : " · not included in this request"}
        </div>
        <DecisionFields prefix="m" id={m.id} revision={m.revision} status={m.status} disabled={disabled} />
        <History items={item.membershipHistory} />
      </div>
      {item.claims.map((c) => (
        <div key={c.claim.id} className="review-item">
          <input type="hidden" name="claim" value={c.claim.id} />
          <b>{c.eventName}</b> <StatusTag status={c.claim.status} /> <span className="muted">rev {c.claim.revision}</span>
          <div style={{ fontSize: 13 }}>
            {c.resultUrl ? (
              <a href={c.resultUrl} target="_blank" rel="noopener noreferrer">
                {c.tournamentName}
              </a>
            ) : (
              c.tournamentName
            )}{" "}
            · {c.tournamentDate} · {c.entryText}
          </div>
          <div style={{ fontSize: 13 }}>Official result: {c.resultText}</div>
          {c.partners.length ? <div className="muted" style={{ fontSize: 12 }}>Also claimed by: {c.partners.join(", ")}</div> : null}
          {c.flags.map((f) => (
            <span key={f} className="flag">
              {f}
            </span>
          ))}
          <DecisionFields prefix="c" id={c.claim.id} revision={c.claim.revision} status={c.claim.status} disabled={disabled} />
          <History items={c.history} />
        </div>
      ))}
      <div className="review-item">
        <SubmitButton pending="Recording…">Record decisions</SubmitButton>
        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
          Each decision is recorded separately against the revision shown.
        </span>
      </div>
    </form>
  );
}
