/**
 * Conservative text normalization for identity matching. Only case,
 * accents, punctuation, "&"/"and" and whitespace are normalized. Abbreviations
 * such as "HS" vs "High School" are NOT expanded automatically; those merges
 * belong in the reviewed alias file.
 */
export function normText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(s: string): string {
  return normText(s).replace(/ /g, "-");
}

export interface SchoolKeyInput {
  name: string;
  city: string | null;
  state: string;
}

/**
 * School match key: normalized name + normalized city + state. Schools with
 * the same name in different cities or states are never merged
 * automatically. A missing city is kept as its own key.
 */
export function schoolMatchKey(s: SchoolKeyInput): string {
  return `${normText(s.name)}|${normText(s.city)}|${s.state.trim().toUpperCase()}`;
}

export function schoolIdFromKey(key: string): string {
  const [name, city, state] = key.split("|");
  return [name, city, state.toLowerCase()].filter(Boolean).join(" ").replace(/ /g, "-");
}

/** Team designation (suffix) normalization: "Team A." and "team a" differ from "A". */
export function normDesignation(s: string | null | undefined): string {
  return normText(s);
}

export function teamSeasonId(schoolId: string, division: string, season: number, designation: string): string {
  const d = designation ? designation.replace(/ /g, "-") : "unlabeled";
  return `${division.toLowerCase()}${season}-${schoolId}--${d}`;
}
