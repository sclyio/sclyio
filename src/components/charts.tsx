"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* Validated categorical order for up to 4 compared series (adjacent-pair CVD
   ΔE ≥ 9.1). Contrast relief: legend + dash patterns + a table view always
   accompany the chart. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
export const DASH = ["", "6 3", "2 3", "10 3 2 3"];

const INK_3 = "#5d6b88";
const GRID = "#eaeef5";

function shortDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

export interface HistoryDatum {
  asOf: string;
  usr: number | null;
  events?: string[]; // tournaments completed in the week ending asOf
}

export function RatingHistoryChart({
  data,
  seasonStart,
  label,
}: {
  data: HistoryDatum[];
  seasonStart?: string | null;
  label: string;
}) {
  const vals = data.map((d) => d.usr).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals) - 0.5);
  const hi = Math.ceil(Math.max(...vals) + 0.5);
  return (
    <figure aria-label={`${label}: rating history chart. A table with the same values follows.`} className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="asOf" tickFormatter={shortDate} tick={{ fill: INK_3, fontSize: 11 }} stroke={GRID} minTickGap={24} />
          <YAxis domain={[Math.max(0, lo), Math.min(20, hi)]} tick={{ fill: INK_3, fontSize: 11 }} stroke={GRID} width={40} />
          {seasonStart ? (
            <ReferenceLine x={seasonStart} stroke={INK_3} strokeDasharray="3 3" label={{ value: "Season start", fill: INK_3, fontSize: 10, position: "insideTopLeft" }} />
          ) : null}
          {data
            .filter((d) => d.events && d.events.length)
            .map((d) => (
              <ReferenceLine key={d.asOf} x={d.asOf} stroke="#c7d2fe" strokeWidth={1} />
            ))}
          <Tooltip
            cursor={{ stroke: INK_3, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as HistoryDatum;
              return (
                <div className="max-w-xs rounded border border-line bg-surface px-2.5 py-2 text-xs shadow">
                  <div className="font-medium">Refit as of {d.asOf}</div>
                  <div className="num mt-0.5">USR {d.usr === null ? "— (no rating yet)" : d.usr.toFixed(2)}</div>
                  {d.events?.length ? <div className="mt-1 text-ink-3">New results: {d.events.join("; ")}</div> : null}
                </div>
              );
            }}
          />
          <Line type="linear" dataKey="usr" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3, fill: "#1d4ed8", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function CompareHistoryChart({
  dates,
  series,
}: {
  dates: string[];
  series: { name: string; values: (number | null)[] }[];
}) {
  const data = dates.map((d, i) => {
    const row: Record<string, string | number | null> = { asOf: d };
    series.forEach((s, j) => (row[`s${j}`] = s.values[i]));
    return row;
  });
  const vals = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return (
    <figure aria-label="Rating histories of the compared entities. The table below lists the same values." className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="asOf" tickFormatter={shortDate} tick={{ fill: INK_3, fontSize: 11 }} stroke={GRID} minTickGap={24} />
          <YAxis domain={[Math.max(0, Math.floor(Math.min(...vals) - 0.5)), Math.min(20, Math.ceil(Math.max(...vals) + 0.5))]} tick={{ fill: INK_3, fontSize: 11 }} stroke={GRID} width={40} />
          <Tooltip
            cursor={{ stroke: INK_3, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded border border-line bg-surface px-2.5 py-2 text-xs shadow">
                  <div className="font-medium">Refit as of {String(label)}</div>
                  {series.map((s, j) => {
                    const v = (payload[0].payload as Record<string, number | null>)[`s${j}`];
                    return (
                      <div key={j} className="mt-0.5 flex items-center gap-1.5">
                        <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: SERIES[j] }} />
                        <span className="text-ink-2">{s.name}</span>
                        <span className="num ml-auto pl-3">{v === null || v === undefined ? "—" : v.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#3a4a6b" }} />
          {series.map((s, j) => (
            <Line
              key={j}
              name={s.name}
              type="linear"
              dataKey={`s${j}`}
              stroke={SERIES[j]}
              strokeWidth={2}
              strokeDasharray={DASH[j]}
              dot={{ r: 3, fill: SERIES[j], stroke: "#fff", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
