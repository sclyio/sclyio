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
