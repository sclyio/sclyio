import type { Exec } from "./db";
import { run } from "./db";

/** Append one audit record (the table rejects UPDATE and DELETE). */
export async function audit(
  db: Exec,
  a: {
    at: string;
    actorUserId: string | null;
    subjectType: "user" | "membership" | "claim" | "request";
    subjectId: string;
    revision?: number | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    detail?: unknown;
  },
) {
  await run(
    db,
    `INSERT INTO audit_log (at, actor_user_id, subject_type, subject_id, revision, action, from_status, to_status, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.at,
      a.actorUserId,
      a.subjectType,
      a.subjectId,
      a.revision ?? null,
      a.action,
      a.fromStatus ?? null,
      a.toStatus ?? null,
      a.detail === undefined ? null : JSON.stringify(a.detail),
    ],
  );
}
