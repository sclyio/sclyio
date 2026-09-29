import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, seasonLabel, TournamentLink } from "./plain";

/**
 * Shared layout for team, school, and member profiles, so the three pages
 * are formatted identically: header card (avatar, name, subtitle, optional
 * chips, rating badges, stats row), tabs, season-grouped result cards.
 */

export interface Stat {
  value: ReactNode;
  label: ReactNode;
}

export function ProfileHeader({
  avatar,
  title,
  sub,
  chips,
  badges,
  stats,
  note,
}: {
  avatar: string;
  title: ReactNode;
  sub: ReactNode;
  chips?: ReactNode;
  badges: ReactNode;
  stats: Stat[];
  /** One short line under the stats (e.g. a rating caveat). */
  note?: ReactNode;
}) {
  return (
    <section className="card">
      <div className="profile">
        <Avatar name={avatar} />
        <div>
          <h1 className="profile-name">{title}</h1>
          <div className="profile-sub">{sub}</div>
          {chips ? (
            <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
              {chips}
            </div>
          ) : null}
        </div>
        <div className="badges">{badges}</div>
      </div>
      <div style={{ marginTop: 16 }}>
        {stats.map((s, i) => (
          <span key={i} className="stat">
            <b>{s.value}</b>
            <span>{s.label}</span>
          </span>
        ))}
      </div>
      {note ? (
        <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
          {note}
        </p>
      ) : null}
    </section>
  );
}

/** Chip row (seasons or divisions). */
export function ChipRow({ items }: { items: { key: string | number; label: ReactNode; href: string; on: boolean }[] }) {
  return (
    <div className="chips">
      {items.map((c) => (
        <Link key={c.key} className={c.on ? "chip on" : "chip"} href={c.href}>
          {c.label}
        </Link>
      ))}
    </div>
  );
}

export function SeasonHead({ season, extra }: { season: number; extra?: ReactNode }) {
  return (
    <h2 className="season-head">
      {seasonLabel(season)}
      {extra ? <> · {extra}</> : null}
    </h2>
  );
}

/** One tournament on a Results tab: name and date on the left, stats on the right. */
export function ResultCard({
  url,
  name,
  meta,
  stats,
  children,
}: {
  url: string | null;
  name: string;
  meta: ReactNode;
  stats: Stat[];
  children?: ReactNode;
}) {
  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          {url ? <TournamentLink url={url} name={name} bold /> : <b>{name}</b>}
          <div className="muted">{meta}</div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {stats.map((s, i) => (
            <span key={i} className="stat" style={{ margin: 0 }}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}

export interface EventRow {
  key: string;
  name: string;
  usr: number | null | undefined;
  /** Third column (e.g. "#3 of 60" or "National"). */
  mid: ReactNode;
  places: string;
}

/** Events tab table (Event · USR · rank or scope · places), identical on every profile. */
export function EventTable({ rows, midLabel = "Rank" }: { rows: EventRow[]; midLabel?: string }) {
  return (
    <section className="card flush scroll">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th className="n">USR</th>
            <th className="n">{midLabel}</th>
            <th>Places</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.key}>
              <td>{e.name}</td>
              <td className="n">
                <span className="pill">{e.usr === null || e.usr === undefined ? "-" : e.usr.toFixed(2)}</span>
              </td>
              <td className="n muted">{e.mid}</td>
              <td className="muted">{e.places || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
