import Link from "next/link";
import { initials } from "@/lib/format";

export const usr = (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toFixed(2));

export function delta(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  const r = Number(v.toFixed(2));
  if (r === 0) return "0.00";
  return r > 0 ? `+${r.toFixed(2)}` : r.toFixed(2);
}

export function Change({ v }: { v: number | null | undefined }) {
  const t = delta(v);
  const cls = t.startsWith("+") ? "chg up" : t.startsWith("-") ? "chg down" : "chg muted";
  return <span className={cls}>{t}</span>;
}

export function teamLabel(designation: string | null | undefined) {
  return designation ? designation : "";
}

/** Season label: 2026 -> "2025-26" (seasons run September to June). */
export const seasonLabel = (season: number) => `${season - 1}-${String(season).slice(2)}`;

export const seasonRange = (first: number, last: number) =>
  first === last ? seasonLabel(first) : `${seasonLabel(first)} to ${seasonLabel(last)}`;

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span className={small ? "avatar sm" : "avatar"} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Rating badge with an evidence meter (share of official events rated). */
export function RatingBadge({
  value,
  label,
  coverage,
  sub,
  trend,
}: {
  value: number | null | undefined;
  label: string;
  coverage?: number;
  sub?: string;
  trend?: boolean;
}) {
  return (
    <div className={trend ? "badge trend" : "badge"}>
      <div className="badge-label">{label}</div>
      <div className="badge-value">{usr(value)}</div>
      {coverage !== undefined ? (
        <div className="meter" title={`${Math.round(coverage * 100)}% of events rated`}>
          <span style={{ width: `${Math.round(coverage * 100)}%` }} />
        </div>
      ) : null}
      {sub ? <div className="badge-sub">{sub}</div> : null}
    </div>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="tabs">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={t.key === active ? "on" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ page, total, size, href }: { page: number; total: number; size: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <span>{page > 1 ? <Link href={href(page - 1)}>‹ Previous</Link> : ""}</span>
      <span>
        Page {page} of {pages}
      </span>
      <span>{page < pages ? <Link href={href(page + 1)}>Next ›</Link> : ""}</span>
    </div>
  );
}
