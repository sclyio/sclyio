import { Csrf, divSeason, StatusTag } from "@/components/account";
import { seasonLabel } from "@/components/plain";
import { SubmitButton } from "@/components/submit-button";
import { canTransition, type MembershipRow } from "@/lib/accounts/claims";
import type { HistoryItem, QueueClaim } from "@/lib/accounts/review";
import { ADMIN_REAUTH_WINDOW_MS } from "@/lib/auth/policy";
import { decideSubmissionAction } from "../(account)/actions";

/** Shared pieces of the admin portal's review forms (queue and records). */

const DECISIONS = [
  ["VERIFIED", "Verify", "verify"],
  ["REJECTED", "Reject", "reject"],
  ["REVOKED", "Revoke", "revoke"],
] as const;

/** Items that "Verify all unreviewed" applies to. */
const BULK = ["SELF_REPORTED", "PENDING"];

export function ReauthNotice({ here }: { here: string }) {
  return (
    <p className="flash error" role="alert">
      Decisions need a Google sign-in within the last {ADMIN_REAUTH_WINDOW_MS / 60000} minutes.{" "}
      <a href={`/auth/google/start?reauth=1&returnTo=${encodeURIComponent(here)}`}>Sign in again</a>
    </p>
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
  const options = DECISIONS.filter(([, , action]) => canTransition(action, status));
  if (!options.length) return null;
  return (
    <div className="decision">
      <input type="hidden" name={`${prefix}:${id}:revision`} value={revision} />
      {BULK.includes(status) ? <input type="hidden" name={`${prefix}:${id}:bulk`} value="1" /> : null}
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

/**
 * One member's affiliation and claims as a single decision form. Each item
 * gets its own decision, recorded separately against the revision shown.
 */
export function ReviewCard({
  user,
  membership: m,
  membershipHistory,
  claims,
  meta,
  note,
  membershipNote,
  csrf,
  back,
  disabled,
}: {
  user: { displayName: string | null };
  membership: MembershipRow;
  membershipHistory: HistoryItem[];
  claims: QueueClaim[];
  meta: React.ReactNode;
  note?: React.ReactNode;
  membershipNote?: string;
  csrf: string;
  back: string;
  disabled: boolean;
}) {
  const unreviewed = [m.status, ...claims.map((c) => c.claim.status)].filter((s) => BULK.includes(s)).length;
  return (
    <form action={decideSubmissionAction} className="card flush">
      <Csrf token={csrf} />
      <input type="hidden" name="back" value={back} />
      <div className="card-head" style={{ display: "block" }}>
        <h2 style={{ margin: 0 }}>
          {user.displayName ?? "(no display name)"} · {m.school_name}
        </h2>
        <div className="muted" style={{ fontSize: 13 }}>
          {divSeason(m.division, m.season)} · {meta}
        </div>
        {note}
      </div>
      <div className="review-item">
        <input type="hidden" name="membership" value={m.id} />
        <b>School affiliation</b> <StatusTag status={m.status} /> <span className="muted">rev {m.revision}</span>
        <div className="muted" style={{ fontSize: 13 }}>
          {m.school_name}, Division {m.division}, {seasonLabel(m.season)}
          {membershipNote ? ` · ${membershipNote}` : ""}
        </div>
        <DecisionFields prefix="m" id={m.id} revision={m.revision} status={m.status} disabled={disabled} />
        <History items={membershipHistory} />
      </div>
      {claims.map((c) => (
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
      <div className="review-item review-actions">
        <SubmitButton pending="Recording…">Record decisions</SubmitButton>
        {unreviewed > 1 && !disabled ? (
          <SubmitButton className="btn-quiet" name="bulk" value="verify" pending="Verifying…">
            Verify all {unreviewed} unreviewed
          </SubmitButton>
        ) : null}
        <span className="muted" style={{ fontSize: 12 }}>
          Each decision is recorded separately against the revision shown.
          {unreviewed > 1 ? " “Verify all” verifies every self-reported or pending item left on “No decision”." : ""}
        </span>
      </div>
    </form>
  );
}
