import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { seasonLabel } from "@/components/plain";
import { requireAdmin } from "@/lib/accounts/actor";
import { AccessError } from "@/lib/accounts/errors";
import { adminSeasonSummary } from "@/lib/accounts/review";
import { requestCtx } from "@/lib/accounts/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminHome() {
  const ctx = await requestCtx();
  await requireAdmin(ctx).catch((e) => {
    if (e instanceof AccessError) notFound();
    throw e;
  });
  const { seasons, openRequests } = await adminSeasonSummary(ctx);
  const records = (season: number, division: string, status = "unverified") => `/admin/records?season=${season}&division=${division}&status=${status}`;

  return (
    <>
      <h1>Verification</h1>
      <section className="card">
        <p style={{ margin: 0 }}>
          <b>{openRequests}</b> open review request{openRequests === 1 ? "" : "s"}. <Link href="/admin/verifications">Open the request queue</Link>
        </p>
      </section>
      <section className="card flush">
        <div className="card-head">
          <h2 style={{ margin: 0 }}>By season</h2>
        </div>
        {seasons.length === 0 ? (
          <p className="muted" style={{ padding: "0 16px" }}>
            No member affiliations yet.
          </p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Div.</th>
                  <th className="n">Affiliations verified</th>
                  <th className="n">Claims verified</th>
                  <th className="n">Claims pending</th>
                  <th className="n">Needs review</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={`${s.season}${s.division}`}>
                    <td>{seasonLabel(s.season)}</td>
                    <td>{s.division}</td>
                    <td className="n">
                      {s.affiliationsVerified} / {s.affiliations}
                    </td>
                    <td className="n">
                      {s.claimsVerified} / {s.claims}
                    </td>
                    <td className="n">{s.claimsPending}</td>
                    <td className="n">{s.affiliationsUnverified + s.claimsUnverified}</td>
                    <td>
                      <Link href={records(s.season, s.division)}>Review</Link> · <Link href={records(s.season, s.division, "any")}>All</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
