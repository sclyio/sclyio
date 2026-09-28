/**
 * Season rating chart (server-rendered SVG, no client JavaScript): USR and
 * Season Trend. The x-axis always spans the season: September 1 to June 30.
 */

const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const USR_COLOR = "#1f6feb";
const TREND_COLOR = "#e8710a";

export interface ChartPoint {
  date: string; // ISO date of the refit
  usr: number;
  trend: number | null;
  newResults: boolean;
}

export function RatingChart({ points, season, label }: { points: ChartPoint[]; season: number; label: string }) {
  const W = 760;
  const H = 240;
  const pad = { l: 42, r: 16, t: 14, b: 28 };
  const start = Date.parse(`${season - 1}-09-01T00:00:00Z`);
  const end = Date.parse(`${season}-06-30T00:00:00Z`);
  const inSeason = points.filter((p) => {
    const t = Date.parse(`${p.date}T00:00:00Z`);
    return t >= start && t <= end;
  });
  if (inSeason.length === 0) return <p className="muted">No ratings this season yet.</p>;

  const trend = inSeason.filter((p) => p.trend !== null) as (ChartPoint & { trend: number })[];
  const vals = [...inSeason.map((p) => p.usr), ...trend.map((p) => p.trend)];
  let lo = Math.floor(Math.min(...vals) - 0.5);
  let hi = Math.ceil(Math.max(...vals) + 0.5);
  lo = Math.max(1, lo);
  hi = Math.min(17, Math.max(hi, lo + 2));
  const x = (d: string) => pad.l + ((Date.parse(`${d}T00:00:00Z`) - start) / (end - start)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (pts: { date: string; v: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const usrPath = line(inSeason.map((p) => ({ date: p.date, v: p.usr })));
  const trendPath = line(trend.map((p) => ({ date: p.date, v: p.trend })));
  const yTicks: number[] = [];
  const step = hi - lo > 6 ? 2 : 1;
  for (let v = Math.ceil(lo); v <= hi; v += step) yTicks.push(v);
  const first = inSeason[0];
  const last = inSeason[inSeason.length - 1];
  const summary =
    `${label}: USR ${first.usr.toFixed(2)} on ${first.date} to ${last.usr.toFixed(2)} on ${last.date}` +
    (last.trend !== null ? `; Season Trend ${last.trend.toFixed(2)}.` : ".");

  return (
    <>
      <div className="legend">
        <span>
          <i style={{ background: USR_COLOR }} /> USR
        </span>
        <span>
          <i style={{ background: TREND_COLOR }} /> Season Trend
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} style={{ display: "block" }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e3e7ee" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#6b7686">
              {v}
            </text>
          </g>
        ))}
        {MONTHS.map((m, i) => {
          const yr = i < 4 ? season - 1 : season;
          const mm = ((i + 8) % 12) + 1;
          const d = `${yr}-${String(mm).padStart(2, "0")}-01`;
          return (
            <text key={m} x={x(d)} y={H - 8} fontSize="11" fill="#6b7686">
              {m}
            </text>
          );
        })}
        {trend.length ? (
          <path d={trendPath} fill="none" stroke={TREND_COLOR} strokeWidth="2" strokeLinejoin="round" strokeDasharray="6 4" />
        ) : null}
        <path d={usrPath} fill="none" stroke={USR_COLOR} strokeWidth="2.5" strokeLinejoin="round" />
        {inSeason
          .filter((p) => p.newResults)
          .map((p) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.usr)} r="4" fill={USR_COLOR} stroke="#fff" strokeWidth="2" />
          ))}
      </svg>
    </>
  );
}
