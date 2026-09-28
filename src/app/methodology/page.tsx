import Link from "next/link";
import type { Metadata } from "next";
import { Panel, Section } from "@/components/ui";
import { backtestResults, type BacktestRow } from "@/lib/queries/coverage";
import { DEFAULT_PARAMS, MODEL_VERSION } from "@/lib/rating/config";
import { placementLogit, toUsr } from "@/lib/rating/math";
import { fitEventPool, observationWeight, type PoolObservation } from "@/lib/rating/model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "How It Works" };

const SENTIENTTREE = "https://docs.google.com/spreadsheets/d/1Te-Tc2BUSdAwfZA_UAjxQHApQe2QD9uT4zoEtgfIssQ/edit?usp=sharing";

/** Fictional example — none of these teams exist. */
function workedExample() {
  const p = DEFAULT_PARAMS;
  const asOf = "2026-02-15";
  const t = [
    { id: "harbor", name: "Harbor Invitational (fictional)", end: "2026-01-10", order: ["Tern Lake A", "Quill Ridge", "Basalt Park", "Juniper Flats"] },
    { id: "summit", name: "Summit Regional (fictional)", end: "2026-02-07", order: ["Quill Ridge", "Juniper Flats", "Oxbow Prep"] },
  ];
  const obs: PoolObservation[] = t.flatMap((tt) =>
    tt.order.map((e, i) => ({
      entityId: e,
      fieldId: tt.id,
      tournamentId: tt.id,
      eventDefId: "example",
      defSeason: 2026,
      endDate: tt.end,
      nSchools: tt.order.length,
      x: placementLogit(i + 1, tt.order.length),
      format: "unknown",
    })),
  );
  const fit = fitEventPool("example", obs, asOf, p, "school");
  const rawW = obs.map((o) => observationWeight(o, asOf, p));
  const mean = rawW.reduce((a, b) => a + b, 0) / rawW.length;
  return { asOf, t, obs, rawW, mean, fit };
}

export default async function MethodologyPage() {
  const ex = workedExample();
  let backtest: BacktestRow[] = [];
  try {
    backtest = await backtestResults();
  } catch {
    backtest = []; // methodology stays readable without a database
  }
  const bt = (div: string, view: string, split: string, model: string, metric: string) =>
    backtest.find((b) => b.division === div && b.view === view && b.split === split && b.model === model && b.metric === metric)?.value;
  const p = DEFAULT_PARAMS;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">How It Works</h1>
      <p className="mt-2 text-ink-2">
        USR (Universal SciOly Rating) is an experimental rating built only from official event placements in public tournament results. It rates
        each event separately, adjusts for how strong each event&apos;s field was, and then combines events into an overall number. Model version{" "}
        <span className="num">{MODEL_VERSION}</span>.
      </p>

      <Section id="plain" title="In plain language">
        <ol className="ml-5 list-decimal space-y-2 text-sm text-ink-2">
          <li>
            <b>Every event is its own contest.</b> For each tournament and event, we take the official place among the teams that actually
            received a comparable placement. No-shows, participation-only results, disqualifications, and exhibition entries are shown in results
            but are not counted in the rating. Missing data is treated as unknown, never as zero.
          </li>
          <li>
            <b>Places become scores.</b> Finishing r-th of n becomes x = ln((n + 1 − r) / r). The middle finisher scores 0, winning a bigger field
            scores higher, and ties share the average place.
          </li>
          <li>
            <b>Field strength is estimated, not assumed.</b> Beating strong teams is worth more. Every tournament event gets an estimated field
            strength k, fitted jointly with every team&apos;s event skill, so a team&apos;s rating depends on who it actually beat.
          </li>
          <li>
            <b>Recent and larger fields count more.</b> Results fade with a 200-day decay, only the last 400 days count, and bigger fields carry a
            little more weight.
          </li>
          <li>
            <b>Thin evidence is pulled toward average.</b> A team with one result is shrunk toward the middle (USR 10) much more than a team with
            ten results.
          </li>
          <li>
            <b>Overall combines all official events.</b> An official event with no comparable result counts as average (the prior), so coverage is
            always shown next to the number. Official total points and placements are kept separately; overall placement is not counted twice.
          </li>
          <li>
            <b>Two views that never mix.</b> Team Performance rates actual team entries (e.g. “Gold”) within one season. School Potential
            superscores a school&apos;s entries event by event within each tournament and re-ranks unique schools — useful for understanding depth,
            but it may not match any roster a school could field. Division B and C are separate pools.
          </li>
        </ol>
      </Section>

      <Section id="eligibility" title="Eligibility, status, and team identity">
        <ul className="ml-5 list-disc space-y-2 text-sm text-ink-2">
          <li>
            <b>Established</b> (numbered national rank): nationally comparable results in all M official events of the season, from at least{" "}
            {p.minTournaments} distinct tournaments, with a result in the last {p.inactiveAfterDays} days. M comes from the season&apos;s official event
            list (23 in both divisions for 2025–26), not a hard-coded number.
          </li>
          <li>
            <b>Provisional</b>: rated, but with missing or local-only events or too few tournaments. Shown with exact coverage and no national rank.
          </li>
          <li>
            <b>Inactive</b>: no eligible result in {p.inactiveAfterDays} days. A profile with no current-season result is not in current-season rankings.
          </li>
          <li>
            <b>Ranks and filters.</b> National and state ranks are computed on the full established pool before any filter or page is applied; filtering
            never renumbers them.
          </li>
          <li>
            <b>Team identity.</b> A school is matched on name, city, and state; same-named schools in different places are never merged
            automatically. A team is school + division + season + label. Team numbers are local to a tournament and never used as identity. An
            unlabeled entry is its own “unlabeled team” only when it was the school&apos;s only entry at that tournament; otherwise it is unresolved and
            excluded from Team Performance until a reviewed mapping resolves it. Unlabeled teams are never assumed to be “A”.
          </li>
          <li>
            <b>Season transitions.</b> Team-season identities restart each season (rosters change). School Potential may use the previous season within
            the 400-day window, but only for official events explicitly listed as equivalent; a rotated-out event never carries into its replacement.
          </li>
          <li>
            <b>Trial events.</b> A trial or trialed event counts only if it is one of the season&apos;s official national events with valid placements.
            Other trial events are displayed but not rated.
          </li>
          <li>
            <b>Sparse and disconnected data.</b> For every event we build a graph of teams and tournament fields. Only the largest connected
            component is nationally comparable; teams in smaller components get local-only event ratings that do not enter national overall ranks.
          </li>
        </ul>
      </Section>

      <Section id="example" title="Worked example (fictional teams)" description="Computed live by the production rating code. The teams and tournaments below do not exist.">
        <Panel className="overflow-x-auto p-4 text-sm">
          <p>
            One event, School Potential view, as of <span className="num">{ex.asOf}</span>. Two fictional tournaments:
          </p>
          <table className="dtable mt-2">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Team</th>
                <th className="r">Place / n</th>
                <th className="r">x = ln((n+1−r)/r)</th>
                <th className="r">Weight (normalized)</th>
              </tr>
            </thead>
            <tbody>
              {ex.obs.map((o, i) => (
                <tr key={o.fieldId + o.entityId}>
                  <td>{ex.t.find((t) => t.id === o.fieldId)!.name}</td>
                  <td>{o.entityId}</td>
                  <td className="r num">
                    {ex.t.find((t) => t.id === o.fieldId)!.order.indexOf(o.entityId) + 1} / {o.nSchools}
                  </td>
                  <td className="r num">{o.x.toFixed(3)}</td>
                  <td className="r num">{(ex.rawW[i] / ex.mean).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3">
            The fit estimates field strengths: Harbor k = <span className="num">{ex.fit.state.k.get("harbor")!.toFixed(3)}</span>, Summit k ={" "}
            <span className="num">{ex.fit.state.k.get("summit")!.toFixed(3)}</span> (positive = stronger field). Adjusted performance is x + k.
          </p>
          <table className="dtable mt-2">
            <thead>
              <tr>
                <th>Team</th>
                <th className="r">Skill s</th>
                <th className="r">Potential q</th>
                <th className="r">Event USR (from q)</th>
                <th className="r">Shrinkage</th>
              </tr>
            </thead>
            <tbody>
              {ex.fit.ratings
                .sort((a, b) => b.value - a.value)
                .map((r) => (
                  <tr key={r.entityId}>
                    <td>{r.entityId}</td>
                    <td className="r num">{r.skill.toFixed(3)}</td>
                    <td className="r num">{r.value.toFixed(3)}</td>
                    <td className="r num">{toUsr(r.value).toFixed(2)}</td>
                    <td className="r num">{(r.shrinkage * 100).toFixed(0)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-3 text-ink-2">
            Quill Ridge finished 2nd at Harbor but won Summit and beat Juniper Flats twice; Tern Lake A&apos;s single win is shrunk more heavily
            because it is one result. Oxbow Prep&apos;s only result is last place in the{" "}
            {ex.fit.state.k.get("summit")! > ex.fit.state.k.get("harbor")! ? "stronger" : "weaker"} Summit field.
          </p>
        </Panel>
      </Section>

      <Section id="backtest" title="Does it work? Backtest results" description="Chronological by tournament: each tournament is predicted only from refits dated before it began. Pairwise accuracy = share of correctly ordered pairs among entrants every model could rate.">
        {backtest.length ? (
          <Panel className="overflow-x-auto p-4 text-sm">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Pool</th>
                  <th>Split</th>
                  <th className="r">Event order · v2</th>
                  <th className="r">· logit baseline</th>
                  <th className="r">· v1 Elo</th>
                  <th className="r">Overall order · v2</th>
                  <th className="r">· logit baseline</th>
                  <th className="r">· v1 Elo</th>
                </tr>
              </thead>
              <tbody>
                {["B", "C"].flatMap((d) =>
                  ["team", "school"].flatMap((v) =>
                    ["validation", "test"].map((s) => (
                      <tr key={d + v + s}>
                        <td>
                          Div {d} · {v === "team" ? "Team Perf." : "School Pot."}
                        </td>
                        <td>{s}</td>
                        {["v2-default", "placement-logit-baseline", "v1-elo"].map((m) => (
                          <td key={m} className="r num">
                            {fmt(bt(d, v, s, m, "event_pairwise_accuracy"))}
                          </td>
                        ))}
                        {["v2-default", "placement-logit-baseline", "v1-elo"].map((m) => (
                          <td key={m} className="r num">
                            {fmt(bt(d, v, s, m, "overall_pairwise_accuracy"))}
                          </td>
                        ))}
                      </tr>
                    )),
                  ),
                )}
              </tbody>
            </table>
            <ul className="mt-3 ml-5 list-disc space-y-1 text-ink-2">
              <li>v2 orders held-out <b>event</b> results better than both baselines in every pool and split.</li>
              <li>
                For <b>overall</b> standings, v2&apos;s School Potential aggregate is at or near the best. For Team Performance, the original overall
                Elo (v1) predicted held-out overall standings better on the validation split. The Team Performance overall USR is a summary of event
                skills, not an optimized predictor of tournament finishes, and should be read that way.
              </li>
              <li>
                λs = {p.lambdaS} was selected on the validation split only (v2-exp.1 used 2). Other parameters are the starting hypotheses; sensitivity
                variants are in <span className="num">docs/backtest.md</span>. The online discount could not be tested because no tournament format is
                recorded yet.
              </li>
              <li>
                External comparison (not ground truth): scly.io School Potential ranks vs. SentientTree&apos;s FINAL tabs — Spearman{" "}
                {fmt(bt("B", "school", "external", "sentienttree", "rank_spearman_matched"))} (B) and{" "}
                {fmt(bt("C", "school", "external", "sentienttree", "rank_spearman_matched"))} (C) over matched established schools. The FINAL tabs&apos;
                as-of date and nationals inclusion are unknown, and discretionary exclusions differ, so this is not a replication check.
              </li>
            </ul>
          </Panel>
        ) : (
          <Panel className="p-4 text-sm text-ink-3">Backtest results have not been generated for this database (run npm run backtest).</Panel>
        )}
      </Section>

      <Section id="credit" title="Credit and what is adapted">
        <Panel className="p-4 text-sm text-ink-2">
          <p>
            The event-wise approach is informed by{" "}
            <a className="link" href={SENTIENTTREE}>
              SentientTree&apos;s 2026 SO Rankings
            </a>{" "}
            (FAQ tab and the Division B overall formula, inspected 2026-09-27): placement logits, superscoring, field (competitiveness) adjustment,
            recency and field-size weights, and a softplus generalized-mean aggregate. scly.io does not claim to reproduce those rankings. The
            following are scly.io adaptations:
          </p>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>A specified regularized least-squares fit for skills and per-event field offsets (the reference&apos;s iteration details are unpublished).</li>
            <li>Recency uses age before the as-of date (the reference&apos;s sign convention is unclear); no competitiveness multiplier in weights.</li>
            <li>A prior term (λs·softplus(0)) in School Potential summaries, and missing events count as the prior rather than contributing nothing.</li>
            <li>No discretionary exclusions; no overall/event blending for sparse fields (explicit components and evidence labels instead).</li>
            <li>A separate Team Performance view; the reference superscores all teams.</li>
            <li>No predicted placements or win probabilities until their calibration has been tested.</li>
          </ul>
          <p className="mt-2">
            UTR Sports inspired the product idea of a searchable, explainable rating. scly.io is not affiliated with UTR and does not use its
            algorithm.
          </p>
        </Panel>
      </Section>

      <Section id="technical" title="Technical details">
        <details className="rounded-md border border-line bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-medium">Show formulas and parameters</summary>
          <div className="mt-3 space-y-3 text-ink-2">
            <p>
              <b>Observation.</b> For event e at tournament t with n eligible participants (entries in Team Performance, unique schools in School
              Potential) and model rank r (midranks for ties): x = ln((n+1−r)/r). Events with n &lt; 2 produce no observation.
            </p>
            <p>
              <b>Weight.</b> w = exp(−age/{p.decayDays}) × N<sup>{p.fieldSizeExponent}</sup> × format, where age = as-of − end date (days, within a{" "}
              {p.windowDays}-day window, never after the as-of date), N = unique eligible schools, format = 1 in person, {p.onlineWeight} explicitly online,{" "}
              {p.unknownFormatWeight} unknown (flagged). Weights are normalized to mean 1 in each event pool.
            </p>
            <p>
              <b>Fit.</b> Minimize Σ w (s<sub>i</sub> − k<sub>t</sub> − x<sub>it</sub>)² + λs Σ s<sub>i</sub>² + λk Σ k<sub>t</sub>² with λs = {p.lambdaS}, λk ={" "}
              {p.lambdaK}. This is strictly convex with a unique solution, solved with preconditioned conjugate gradient and accepted only when one
              alternating update moves no parameter by more than {p.tolerance} (cap {p.maxIterations.toLocaleString()} iterations). Non-converged fits
              block publication.
            </p>
            <p>
              <b>Event values.</b> Team Performance uses s. School Potential uses q = softplus⁻¹((Σ w·softplus(x + k) + λs·softplus(0)) / (Σ w + λs)).
            </p>
            <p>
              <b>Overall.</b> Team Performance: mean of s over all M official events (0 for missing or local-only). School Potential:
              softplus⁻¹(mean of softplus(q)) over M events (q = 0 for missing).
            </p>
            <p>
              <b>Display.</b> USR = {p.scaleMax} / (1 + exp(−z / {p.scaleSpread})): z = 0 → 10. Two decimals shown; sorting uses full precision. The
              scale is a presentation convention; values are not calibrated across divisions, views, seasons, events, or disconnected components.
            </p>
            <p>
              <b>Refits and history.</b> Ratings are refit every Sunday from results completed by that date. Change explanations decompose each move
              exactly into new results, recency, field recalibration, and window/coverage. Pre-tournament field strength uses the last refit strictly
              before the start date; per-event k values shown on tournament pages are retrospective.
            </p>
            <p>
              <b>Evidence labels</b> (heuristics, not confidence intervals): strong = 3+ appearances and n<sub>eff</sub> ≥ 2.5; moderate = 2+
              appearances; limited = 1; local only = outside the reference component. n<sub>eff</sub> = (Σw)²/Σw².
            </p>
          </div>
        </details>
      </Section>

      <p className="mt-8 text-sm text-ink-3">
        Data sources and coverage limits: <Link className="link" href="/data">Data coverage</Link>.
      </p>
    </div>
  );
}

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toFixed(3));
