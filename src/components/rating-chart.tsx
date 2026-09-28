/**
 * Rating chart (server-rendered SVG, no client JavaScript): USR and Season
 * Trend over up to the last 4 seasons, drawn as one continuous line. Each
 * season's axis section spans September 1 to June 30.
 */

const USR_COLOR = "#1f6feb";
const TREND_COLOR = "#e8710a";

export interface ChartPoint {
  date: string; // ISO date of the refit
  season: number;
  usr: number;
  trend: number | null;
  newResults: boolean;
}

const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function RatingChart({ points, seasons, label }: { points: ChartPoint[]; seasons: number[]; label: string }) {
  const W = 760;
  const H = 240;
  const pad = { l: 42, r: 16, t: 14, b: 28 };
  const shown = [...seasons].sort((a, b) => a - b);
  const inRange = points.filter((p) => shown.includes(p.season));
  if (!shown.length || inRange.length === 0) return <p className="muted">No ratings yet.</p>;
  const start = t(`${shown[0] - 1}-09-01`);
  const end = t(`${shown[shown.length - 1]}-06-30`);

  const vals = [...inRange.map((p) => p.usr), ...inRange.flatMap((p) => (p.trend === null ? [] : [p.trend]))];
  let lo = Math.floor(Math.min(...vals) - 0.5);
  let hi = Math.ceil(Math.max(...vals) + 0.5);
  lo = Math.max(1, lo);
  hi = Math.min(17, Math.max(hi, lo + 2));
  const x = (d: string) => pad.l + ((t(d) - start) / (end - start)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (pts: { date: string; v: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const trendPts = inRange.filter((p) => p.trend !== null).map((p) => ({ date: p.date, v: p.trend! }));
  const yTicks: number[] = [];
  const step = hi - lo > 6 ? 2 : 1;
  for (let v = Math.ceil(lo); v <= hi; v += step) yTicks.push(v);
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
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
        {shown.map((s) => {
          const x0 = x(`${s - 1}-09-01`);
          const x1 = x(`${s}-06-30`);
          return (
            <g key={s}>
              {shown.length > 1 ? <line x1={x0} x2={x0} y1={pad.t} y2={H - pad.b} stroke="#e3e7ee" /> : null}
              <text x={(x0 + x1) / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b7686">
                {shown.length > 1 ? `${s - 1}-${String(s).slice(2)}` : ""}
              </text>
            </g>
          );
        })}
        {shown.length === 1
          ? ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((m, i) => {
              const s = shown[0];
              const yr = i < 4 ? s - 1 : s;
              const mm = ((i + 8) % 12) + 1;
              return (
                <text key={m} x={x(`${yr}-${String(mm).padStart(2, "0")}-01`)} y={H - 8} fontSize="11" fill="#6b7686">
                  {m}
                </text>
              );
            })
          : null}
        {trendPts.length ? (
          <path d={line(trendPts)} fill="none" stroke={TREND_COLOR} strokeWidth="2" strokeLinejoin="round" strokeDasharray="6 4" />
        ) : null}
        <path d={line(inRange.map((p) => ({ date: p.date, v: p.usr })))} fill="none" stroke={USR_COLOR} strokeWidth="2.5" strokeLinejoin="round" />
        {inRange
          .filter((p) => p.newResults)
          .map((p) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.usr)} r={shown.length > 1 ? 3 : 4} fill={USR_COLOR} stroke="#fff" strokeWidth="1.5" />
          ))}
      </svg>
    </>
  );
}
