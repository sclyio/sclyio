import Link from "next/link";
import type { HistoryPoint } from "@/lib/queries/profiles";
import { Change, seasonLabel, usr } from "./plain";
import { RatingChart } from "./rating-chart";

/**
 * Rating History tab shared by team and school profiles: the chart covers
 * the last 4 rated seasons; the table shows the latest season, plus one more
 * per "Load more".
 */
export function RatingHistory({
  hist,
  names,
  label,
  more,
  moreHref,
}: {
  hist: HistoryPoint[];
  /** Tournament id -> name, for the "New results" column. */
  names: Map<string, string>;
  label: string;
  more: number;
  moreHref: (more: number) => string;
}) {
  const rated = hist.filter((h) => h.usr !== null);
  const ratedSeasons = [...new Set(rated.map((h) => h.season))].sort((a, b) => b - a);
  const chartSeasons = ratedSeasons.filter((s) => s > (ratedSeasons[0] ?? 0) - 4);
  const shownMore = Math.max(0, Math.min(more, ratedSeasons.length));
  const tableSeasons = ratedSeasons.slice(0, 1 + shownMore);
  return (
    <>
      <section className="card">
        <h2>
          {chartSeasons.length > 1
            ? `${seasonLabel(chartSeasons[chartSeasons.length - 1])} to ${seasonLabel(chartSeasons[0])}`
            : chartSeasons.length
              ? `${seasonLabel(chartSeasons[0])} season`
              : "Rating history"}
        </h2>
        <RatingChart
          seasons={chartSeasons}
          label={label}
          points={rated.map((h) => ({
            date: h.asOf,
            season: h.season,
            usr: h.usr!,
            trend: h.trendUsr,
            newResults: Boolean(h.explain?.t?.length),
          }))}
        />
      </section>
      {tableSeasons.length ? (
        <section className="card flush scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="n">USR</th>
                <th className="n">Change</th>
                <th className="n">Season Trend</th>
                <th>New results</th>
              </tr>
            </thead>
            {tableSeasons.map((s) => (
              <tbody key={s}>
                <tr className="season-row">
                  <td colSpan={5}>{seasonLabel(s)}</td>
                </tr>
                {rated
                  .filter((h) => h.season === s)
                  .reverse()
                  .map((h, i, arr) => {
                    const prev = arr[i + 1];
                    return (
                      <tr key={h.asOf}>
                        <td>{h.asOf}</td>
                        <td className="n">
                          <span className="pill">{usr(h.usr)}</span>
                        </td>
                        <td className="n">
                          {prev ? <Change v={(h.usr ?? 0) - (prev.usr ?? 0)} /> : <span className="muted">season start</span>}
                        </td>
                        <td className="n">{usr(h.trendUsr)}</td>
                        <td className="muted">{(h.explain?.t ?? []).map((x) => names.get(x) ?? x).join(", ")}</td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </section>
      ) : null}
      {tableSeasons.length < ratedSeasons.length ? (
        <div className="load-more">
          <Link className="chip" href={moreHref(shownMore + 1)} scroll={false}>
            Load more
          </Link>
        </div>
      ) : null}
    </>
  );
}
