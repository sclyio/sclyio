import { seasonLabel } from "./plain";

export function Csrf({ token }: { token: string }) {
  return <input type="hidden" name="csrf" value={token} />;
}

/** Message from the last action (?msg= / ?error=), announced to screen readers. */
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const msg = one(sp.msg);
  const error = one(sp.error);
  if (error) return <p className="flash error" role="alert">{error}</p>;
  if (msg) return <p className="flash ok" role="status">{msg}</p>;
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  SELF_REPORTED: "Self-reported",
  PENDING: "Pending review",
  VERIFIED: "Admin-verified",
  REJECTED: "Rejected",
  REVOKED: "Revoked",
  WITHDRAWN: "Withdrawn",
};

/** `subject` names what the status applies to, so an affiliation badge never reads as "all claims verified". */
export function StatusTag({ status, subject }: { status: string; subject?: string }) {
  return (
    <span className={`status s-${status.toLowerCase()}`}>
      {subject ? `${subject}: ` : ""}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export const divSeason = (division: string, season: number) => `Division ${division} · ${seasonLabel(season)}`;

/** Small verified / unverified mark with a text alternative. */
export function VerifiedIcon({ verified }: { verified: boolean }) {
  const label = verified ? "Verified by the scly.io admin" : "Unverified (self-reported)";
  return (
    <span className={verified ? "vmark on" : "vmark"} title={label} role="img" aria-label={label}>
      {verified ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <path d="M4.5 8.2l2.3 2.3 4.7-4.9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2" />
        </svg>
      )}
    </span>
  );
}
