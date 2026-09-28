export const fmtUsr = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toFixed(2));

export function fmtDelta(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${fmtDate(iso)} ${iso.slice(11, 16)} UTC`;
}

export function seasonLabel(season: number): string {
  return `${season - 1}–${String(season).slice(2)}`;
}

const STATE_NAMES: Record<string, string> = { nCA: "CA (North)", sCA: "CA (South)" };
export const stateLabel = (s: string | null | undefined) => (s ? (STATE_NAMES[s] ?? s) : "—");

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(of|the|and|for|at|high|school|middle|junior|academy|hs|ms)$/i.test(w));
  const pick = (words.length ? words : name.split(/\s+/)).slice(0, 2);
  return pick.map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export const STATUS_TEXT: Record<string, string> = {
  placed: "",
  participation_only: "PO",
  no_show: "NS",
  disqualified: "DQ",
  unknown: "?",
  withdrawn: "WD",
  canceled: "CX",
};
