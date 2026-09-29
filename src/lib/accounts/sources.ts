import type { Client } from "@libsql/client";
import type { DataSource } from "./actor";
import { audit } from "./audit";
import { run } from "./db";
import { sourceSnapshot } from "./dataset";

export interface ClaimSourceRow {
  id: string;
  status: string;
  revision: number;
  tournament_id: string;
  entry_id: string;
  tournament_event_id: string;
  source_hash: string;
  source_state: string;
}

/**
 * Re-check claimed results against the active dataset after a source
 * correction. Unreviewed claims follow the corrected result silently; a
 * VERIFIED claim keeps the fingerprint the admin reviewed and is marked
 * "changed" for re-review. Results that disappeared are marked "missing"
 * (never rated). Returns the claims whose state changed.
 */
export async function refreshClaimSources(db: Client, data: DataSource, claims: ClaimSourceRow[], now: Date): Promise<string[]> {
  const changed: string[] = [];
  const at = now.toISOString();
  for (const c of claims) {
    if (c.status === "WITHDRAWN") continue;
    const snap = await sourceSnapshot(data, c);
    let state: string;
    let hash = c.source_hash;
    if (snap.missing) state = "missing";
    else if (snap.hash === c.source_hash) state = "current";
    else if (c.status === "VERIFIED") state = "changed";
    else {
      state = "current";
      hash = snap.hash;
    }
    if (state === c.source_state && hash === c.source_hash) continue;
    // Guarded on revision so a concurrent edit is never overwritten.
    const n = await run(db, `UPDATE participation_claims SET source_state = ?, source_hash = ? WHERE id = ? AND revision = ? AND status = ?`, [
      state,
      hash,
      c.id,
      c.revision,
      c.status,
    ]);
    if (!n) continue;
    if (state !== c.source_state) {
      await audit(db, {
        at,
        actorUserId: null,
        subjectType: "claim",
        subjectId: c.id,
        revision: c.revision,
        action: `source_${state}`,
        fromStatus: c.status,
        toStatus: c.status,
        detail: { previousHash: c.source_hash, currentHash: snap.hash },
      });
    }
    c.source_state = state;
    c.source_hash = hash;
    changed.push(c.id);
  }
  return changed;
}
