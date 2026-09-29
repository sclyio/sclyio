import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Csrf, Flash, StatusTag } from "@/components/account";
import { SubmitButton } from "@/components/submit-button";
import { claimForOwner } from "@/lib/accounts/claims";
import { entryLabel, entryResults, schoolEntries, resultText, tournamentById, tournamentEvents } from "@/lib/accounts/dataset";
import { ValidationError } from "@/lib/accounts/errors";
import { dataSource, pageUser } from "@/lib/accounts/server";
import { editClaimAction } from "../../../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit claim", robots: { index: false } };

export default async function EditClaim(props: PageProps<"/dashboard/claims/[id]/edit">) {
  const { id } = await props.params;
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { csrf, ctx } = await pageUser(`/dashboard/claims/${id}/edit`);
  const c = await claimForOwner(ctx, id).catch((e) => {
    if (e instanceof ValidationError) return null;
    throw e;
  });
  if (!c || c.status === "WITHDRAWN") notFound();
  const t = await tournamentById(dataSource, c.tournament_id);
  const [entries, events, results] = t
    ? await Promise.all([schoolEntries(dataSource, t.id, c.school_id), tournamentEvents(dataSource, t.id), entryResults(dataSource, t.id, c.entry_id)])
    : [[], [], []];
  const current = results.find((r) => r.tournament_event_id === c.tournament_event_id);
  return (
    <>
      <h1>Edit claim</h1>
      <Flash sp={sp} />
      <section className="card">
        <p>
          {t?.name ?? c.tournament_id} · current status <StatusTag status={c.status} /> · revision {c.revision}
        </p>
        <p className="muted">Current official result: {resultText(current)}</p>
        {c.status === "VERIFIED" || c.status === "PENDING" ? (
          <p className="note">
            Changing the team entry or event creates a new revision and resets this claim to self-reported. You can request verification again
            afterwards.
          </p>
        ) : null}
        <form action={editClaimAction}>
          <Csrf token={csrf} />
          <input type="hidden" name="claim" value={c.id} />
          <input type="hidden" name="revision" value={c.revision} />
          <input type="hidden" name="back" value={`/dashboard/claims/${c.id}/edit`} />
          <div className="field">
            <label htmlFor="entry">Team entry</label>
            <select id="entry" name="entry" defaultValue={c.entry_id}>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.raw_school} · {entryLabel(e)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="event">Event</label>
            <select id="event" name="event" defaultValue={c.tournament_event_id}>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                  {ev.trial || ev.trialed ? " (trial)" : ""}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton>Save changes</SubmitButton> <Link href="/dashboard">Cancel</Link>
        </form>
      </section>
    </>
  );
}
