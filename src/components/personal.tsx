import { PROVISIONAL_MIN_CLAIMS, PROVISIONAL_MIN_COMPETITIONS } from "@/lib/personal/rating";
import type { PersonalView } from "@/lib/personal/snapshots";
import { divSeason } from "./account";
import { seasonLabel, usr } from "./plain";

/**
 * Unofficial USR card: USR (last 4 seasons) and Season Trend (this season
 * only), the required caveat, verified-evidence counts, and the event
 * breakdown. Used on the dashboard and on public member profiles.
 */
export function PersonalRatingCard({ division, season, view, own }: { division: string; season: number; view: PersonalView; own: boolean }) {
  const s = view.snapshot;
  const id = `pr-${division}${season}`;
  return (
    <section className="card" aria-labelledby={id}>
      <h2 id={id}>Unofficial USR · {divSeason(division, season)}</h2>
      <div className="personal">
        {view.pending ? (
          <div className="state-box" role="status">
            <b>Rating calculation pending</b>
            <div>{view.reason}</div>
          </div>
        ) : s!.state === "rated" ? (
          <div className="badges" style={{ marginLeft: 0 }}>
            <div className="badge unofficial">
              <div className="badge-label">UNOFFICIAL USR</div>
              <div className="badge-value">{usr(s!.summaryUsr)}</div>
              <div className="badge-sub">
                based on {s!.ratedEvents} event{s!.ratedEvents === 1 ? "" : "s"} and {s!.competitions} competition{s!.competitions === 1 ? "" : "s"}
              </div>
              {s!.provisional ? (
                <div className="badge-sub">
                  <b>Provisional</b>
                </div>
              ) : null}
            </div>
            <div className="badge trend unofficial">
              <div className="badge-label">SEASON TREND</div>
              <div className="badge-value">{s!.trendState === "rated" ? usr(s!.trendUsr) : "-"}</div>
              <div className="badge-sub">{s!.trendState === "rated" ? `${seasonLabel(season)} only` : "no rated events this season"}</div>
            </div>
          </div>
        ) : s!.state === "insufficient_comparable" ? (
          <div className="state-box">
            <b>No comparable model estimate</b>
            <div>The rated events are not connected to the national comparison yet, so only local event estimates are shown.</div>
          </div>
        ) : (
          <div className="state-box">
            <b>No eligible result</b>
            <div>No counted claim has a rated official result yet. Nothing is shown rather than a default score.</div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <p style={{ marginTop: 0 }}>
            <b>Estimated from {own ? "your" : "their"} claimed team-event results. It does not isolate {own ? "your" : "their"} individual contribution.</b>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            It reflects only the events {own ? "you" : "they"} selected, so it is not comparable to a school or team rating. Like team ratings, the USR
            counts the last 4 seasons (earlier seasons weigh less) and the Season Trend counts this season only.
            {s ? (
              <>
                {" "}
                {s.verifiedContributingClaims} of {s.contributingClaims} contributing claim{s.contributingClaims === 1 ? " is" : "s are"} admin-verified; the
                rest are self-reported.
              </>
            ) : null}
            {s?.provisional ? ` Provisional: fewer than ${PROVISIONAL_MIN_CLAIMS} comparable claims or ${PROVISIONAL_MIN_COMPETITIONS} competitions.` : ""}
          </p>
        </div>
      </div>
      {s && s.events.length ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th className="n">Estimate</th>
                <th className="n">Claims</th>
                <th className="n">Competitions</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {s.events.map((e) => (
                <tr key={e.eventDefId}>
                  <td>{e.name}</td>
                  <td className="n">{usr(e.usr)}</td>
                  <td className="n">{e.claims}</td>
                  <td className="n">{e.competitions}</td>
                  <td className="muted">{e.comparable ? "National" : "Local only (not in summary)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {s ? (
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Model {s.modelVersion} / {s.methodVersion}
          {s.ratingAsOf ? ` · field adjustments from the ${s.ratingAsOf} refit` : ""} · computed {s.computedAt.slice(0, 16).replace("T", " ")} UTC
        </p>
      ) : null}
    </section>
  );
}
