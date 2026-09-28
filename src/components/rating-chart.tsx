/**
 * Season rating trend (server-rendered SVG, no client JavaScript).
 * The x-axis always spans the season: September 1 to June 30.
 */

const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export interface ChartPoint {
  date: string; // ISO date of the refit
  usr: number;
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

  const vals = inSeason.map((p) => p.usr);
  let lo = Math.floor(Math.min(...vals) - 0.5);
  let hi = Math.ceil(Math.max(...vals) + 0.5);
  lo = Math.max(1, lo);
  hi = Math.min(17, Math.max(hi, lo + 2));
  const x = (d: string) => pad.l + ((Date.parse(`${d}T00:00:00Z`) - start) / (end - start)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const path = inSeason.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.usr).toFixed(1)}`).join(" ");
  const area = `${path} L${x(inSeason[inSeason.length - 1].date).toFixed(1)},${H - pad.b} L${x(inSeason[0].date).toFixed(1)},${H - pad.b} Z`;
  const yTicks: number[] = [];
  const step = hi - lo > 6 ? 2 : 1;
  for (let v = Math.ceil(lo); v <= hi; v += step) yTicks.push(v);
  const first = inSeason[0];
  const last = inSeason[inSeason.length - 1];
  const summary = `${label}: USR ${first.usr.toFixed(2)} on ${first.date} to ${last.usr.toFixed(2)} on ${last.date}.`;

  return (
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
      <path d={area} fill="#1f6feb" fillOpacity="0.08" />
      <path d={path} fill="none" stroke="#1f6feb" strokeWidth="2.5" strokeLinejoin="round" />
      {inSeason
        .filter((p) => p.newResults)
        .map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.usr)} r="4" fill="#1f6feb" stroke="#fff" strokeWidth="2" />
        ))}
    </svg>
  );
}
