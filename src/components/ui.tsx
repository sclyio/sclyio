import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDelta, initials } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Section({
  title,
  children,
  aside,
  id,
  description,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
  description?: ReactNode;
}) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} id={id} className="mt-8 scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={id ? `${id}-h` : undefined} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description ? <div className="mt-0.5 max-w-3xl text-sm text-ink-3">{description}</div> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-md border border-line bg-surface", className)}>{children}</div>;
}

type Tone = "neutral" | "cobalt" | "lime" | "amber" | "red";

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-line-2 text-ink-2",
    cobalt: "bg-cobalt-soft text-cobalt-2",
    lime: "bg-lime-soft text-lime-ink",
    amber: "bg-amber-soft text-amber-ink",
    red: "bg-red-soft text-red-ink",
  };
  return (
    <span title={title} className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge>Unrated</Badge>;
  if (status === "established")
    return (
      <Badge tone="lime" title="Meets national eligibility: comparable results in every official event and at least three tournaments">
        Established
      </Badge>
    );
  if (status === "provisional")
    return (
      <Badge tone="amber" title="Rated with limited coverage; no numbered national rank">
        Provisional
      </Badge>
    );
  if (status === "inactive") return <Badge title="No eligible result in the last 180 days">Inactive</Badge>;
  return <Badge>{status}</Badge>;
}

export function EvidenceBadge({ evidence }: { evidence: string }) {
  const map: Record<string, [Tone, string, string]> = {
    strong: ["lime", "Strong", "3+ eligible appearances and effective sample size ≥ 2.5 (heuristic, not a confidence interval)"],
    moderate: ["cobalt", "Moderate", "2+ eligible appearances (heuristic)"],
    limited: ["amber", "Limited", "One eligible appearance: heavily shrunk toward the prior"],
    "local-only": ["neutral", "Local only", "Not connected to this event's reference component; not nationally comparable"],
  };
  const [tone, label, title] = map[evidence] ?? ["neutral", evidence, evidence];
  return (
    <Badge tone={tone} title={title}>
      {label}
    </Badge>
  );
}

export function Initials({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-base" }[size];
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-md border border-line bg-cobalt-soft font-semibold text-cobalt-2", s)}
    >
      {initials(name)}
    </span>
  );
}

export function Delta({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className="num text-ink-3">—</span>;
  const r = Number(value.toFixed(digits));
  const cls = r > 0 ? "text-green-ink" : r < 0 ? "text-red-ink" : "text-ink-3";
  return (
    <span className={cx("num", cls)}>
      <span className="sr-only">{r > 0 ? "up " : r < 0 ? "down " : "unchanged "}</span>
      {fmtDelta(value, digits)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-surface px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-xl text-sm text-ink-3">{children}</div> : null}
    </div>
  );
}

export function Pagination({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const item = "rounded border border-line px-3 py-1.5 text-sm";
  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-ink-3">
        Page <span className="num">{Math.min(page, pages)}</span> of <span className="num">{pages}</span> ·{" "}
        <span className="num">{total.toLocaleString()}</span> rows
      </span>
      {pages > 1 ? (
        <span className="flex gap-2">
          {page > 1 ? (
            <Link className={cx(item, "bg-surface hover:border-cobalt")} href={href(page - 1)} rel="prev">
              Previous
            </Link>
          ) : (
            <span className={cx(item, "text-ink-3 opacity-60")} aria-disabled="true">
              Previous
            </span>
          )}
          {page < pages ? (
            <Link className={cx(item, "bg-surface hover:border-cobalt")} href={href(page + 1)} rel="next">
              Next
            </Link>
          ) : (
            <span className={cx(item, "text-ink-3 opacity-60")} aria-disabled="true">
              Next
            </span>
          )}
        </span>
      ) : null}
    </nav>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="num mt-0.5 text-xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-ink-3">{sub}</div> : null}
    </div>
  );
}

export const selectCls = "rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink hover:border-ink-3";
export const inputCls = "rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 hover:border-ink-3";
export const btnCls = "inline-flex items-center gap-1.5 rounded bg-cobalt px-3 py-1.5 text-sm font-medium text-white hover:bg-cobalt-2";
export const btnGhostCls =
  "inline-flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-cobalt";
