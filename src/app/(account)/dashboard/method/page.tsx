import type { Metadata } from "next";
import Link from "next/link";
import { PERSONAL_PRIOR_WEIGHT, PROVISIONAL_MIN_CLAIMS, PROVISIONAL_MIN_COMPETITIONS } from "@/lib/personal/rating";

export const metadata: Metadata = { title: "How the Unofficial USR works" };

export default function Method() {
  return (
    <section className="card" style={{ maxWidth: 760 }}>
      <h1>How the Unofficial USR works</h1>
      <p>
        <b>Estimated from your claimed team-event results. It does not isolate your individual contribution.</b> Public results record how a team
        placed in each event, not what each student did, so this is an experimental proxy, not a validated measure of individual ability.
      </p>
      <ol>
        <li>
          For each event you claim, scly.io reads your team&apos;s official placing and computes the same placement value the team rating uses: x =
          ln((n + 1 − r) / r) among the n eligible teams, with ties and no-shows handled exactly as for team ratings.
        </li>
        <li>
          It adds the published field adjustment k for that tournament event (how strong that field was, from the season&apos;s latest team refit),
          giving a = x + k, and uses that refit&apos;s weight w for the result (recency, tournament level, format, field size, competitiveness).
        </li>
        <li>
          Per event: s = Σ w·a / (Σ w + {PERSONAL_PRIOR_WEIGHT}). The +{PERSONAL_PRIOR_WEIGHT} pulls sparse evidence toward an average result.
        </li>
        <li>
          Summary: the average of your rated events in that division and season, shown on the site&apos;s scale: USR = 1 + 15.5 / (1 + e^(−(z − 0.85)
          / 0.6)).
        </li>
      </ol>
      <p>
        Only events you claimed count. There is no default score for events without a result, and your school&apos;s or team&apos;s overall rating is
        never used. Results outside the national comparison are shown as local estimates and left out of the summary. The rating is provisional with
        fewer than {PROVISIONAL_MIN_CLAIMS} contributing claims or {PROVISIONAL_MIN_COMPETITIONS} competitions.
      </p>
      <p>
        Self-reported and pending claims count immediately; rejected, revoked, and withdrawn ones do not. Your claims never change any team, school, or
        tournament result or rating.
      </p>
      <p>
        <Link href="/dashboard">Back to dashboard</Link>
      </p>
    </section>
  );
}
