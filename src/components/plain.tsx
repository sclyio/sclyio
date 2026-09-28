import Link from "next/link";

export const usr = (v: number | null | undefined) => (v === null || v === undefined ? "-" : v.toFixed(2));

export function delta(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const r = Number(v.toFixed(2));
  return r > 0 ? `+${r.toFixed(2)}` : r.toFixed(2);
}

export function teamLabel(designation: string | null | undefined) {
  return designation ? designation : "(unlabeled)";
}

export function Pager({ page, total, size, href }: { page: number; total: number; size: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <p>
      {page > 1 ? <Link href={href(page - 1)}>&lt; Previous</Link> : "< Previous"} | Page {page} of {pages} |{" "}
      {page < pages ? <Link href={href(page + 1)}>Next &gt;</Link> : "Next >"}
    </p>
  );
}
