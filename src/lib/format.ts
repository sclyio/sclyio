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
