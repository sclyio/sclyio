import Interpreter from "sciolyff/interpreter";

import valid from "sciolyff/validator";



/**

 * SciolyFF → normalized tournament record. Tournament scoring (ranks,

 * points, drops, exhibition adjustments, ties, penalties) is taken from the

 * official `sciolyff` interpreter rather than reimplemented.

 */



export type ResultStatus =

  | "placed"

  | "participation_only"

  | "no_show"

  | "disqualified"

  | "unknown"

  | "withdrawn"

  | "canceled";



export interface ParsedEvent {

  name: string;

  ordinal: number;

  trial: boolean;

  trialed: boolean;

  medals: number | null;

  maximumPlace: number | null;

}



export interface ParsedTeam {

  number: number;

  school: string;

  suffix: string | null;

  city: string | null;

  state: string;

  schoolAbbreviation: string | null;

  track: string | null;

  exhibition: boolean;

  disqualified: boolean;

  rank: number | null;

  points: number | null;

  trackRank: number | null;

  trackPoints: number | null;

  earnedBid: boolean | null;

  penaltyPoints: number;

  medalCounts: number[] | null;

}



export interface ParsedPlacing {

  team: number;

  event: string;

  status: ResultStatus;

  place: number | null;

  tie: boolean;

  exempt: boolean;

  dropped: boolean;

  points: number | null;

  isolatedPoints: number | null;

  trackPlace: number | null;

  medal: number | null;

  raw: unknown;

  affectedByExhibition: boolean;

}



export interface ParsedTournament {

  name: string;

  shortName: string | null;

  location: string | null;

  state: string | null;

  level: string;

  division: string;

  season: number;

  startDate: string;

  endDate: string;

  awardsDate: string | null;

  medals: number | null;

  trophies: number | null;

  worstPlacingsDropped: number;

  nOffset: number;

  reverseScoring: boolean;

  tracks: { name: string; medals: number | null; trophies: number | null }[];

  events: ParsedEvent[];

  teams: ParsedTeam[];

  placings: ParsedPlacing[];

  penalties: { team: number; points: number }[];

}



export interface ValidationOutcome {

  /** True when the file may be imported (fully valid, or metadata-only issues). */

  accepted: boolean;

  /** Strict SciolyFF validity. */

  strictlyValid: boolean;

  warnings: number;

  /** Award-metadata validation errors accepted under the documented policy. */

  metadataIssues: string[];

  message: string;

}



/**

 * Validation policy (documented on /data and in the README):

 * files failing SciolyFF validation are quarantined, EXCEPT when every

 * failing check is confined to award metadata that cannot change

 * placings, points, or ranks — tournament/track trophy, medal and bid counts

 * and the "short name must differ from name" style rule. Those files are

 * imported and flagged with their metadata issues.

 */

const METADATA_ONLY: RegExp[] = [

  /^bids: larger than school count$/,

  /^(Tournament|Tracks\[\d+\])\.(trophies|medals|bids) must be/,

  /^field 'short name' should be different from field 'name'$/,

];



export async function validateSciolyff(yamlText: string): Promise<ValidationOutcome> {

  // canonical:false — canonical-name checks fetch remote lists per file.

  const res = await valid(yamlText, { canonical: false });

  const errors = (res.errors ?? []) as { warning?: boolean; message?: string; location?: { line?: number } }[];

  const fmt = (e: (typeof errors)[number]) => `${e.message ?? "error"}${e.location?.line ? ` (line ${e.location.line})` : ""}`;

  const hard = errors.filter((e) => !e.warning);

  const metadata = hard.filter((e) => METADATA_ONLY.some((re) => re.test(e.message ?? "")));

  const blocking = hard.filter((e) => !metadata.includes(e));

  return {

    accepted: Boolean(res.valid) || (hard.length > 0 && blocking.length === 0),

    strictlyValid: Boolean(res.valid),

    warnings: errors.filter((e) => e.warning).length,

    metadataIssues: metadata.map(fmt),

    message:

      blocking.slice(0, 5).map(fmt).join("; ") +

        (blocking.length > 5 ? `; +${blocking.length - 5} more` : "") || String(res.status),

  };

}



function isoDate(v: unknown): string | null {

  if (v === undefined || v === null || v === "") return null;

  if (v instanceof Date) return v.toISOString().slice(0, 10);

  const s = String(v);

  const m = s.match(/^\d{4}-\d{2}-\d{2}/);

  return m ? m[0] : null;

}



const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);



export function parseSciolyff(yamlText: string): ParsedTournament {

  const I = new Interpreter(yamlText);

  const T = I.tournament;

  const rep = I.rep.Tournament as unknown as Record<string, unknown>;

  const start = isoDate(rep["start date"]) ?? isoDate(rep["date"]);

  const end = isoDate(rep["end date"]) ?? start;

  if (!start || !end) throw new Error("Tournament has no start date");

  const division = String(T.division).toUpperCase();



  const events: ParsedEvent[] = I.events.map((e, i) => ({

    name: e.name,

    ordinal: i,

    trial: Boolean(e.trial),

    trialed: Boolean(e.trialed),

    medals: num(e.medals),

    maximumPlace: num(e.maximumPlace),

  }));



  const penaltyByTeam = new Map<number, number>();

  const penalties = I.penalties.map((p) => {

    const team = p.team?.number ?? Number((p.rep as unknown as { team: number }).team);

    penaltyByTeam.set(team, (penaltyByTeam.get(team) ?? 0) + p.points);

    return { team, points: p.points };

  });



  const teams: ParsedTeam[] = I.teams.map((t) => ({

    number: t.number,

    school: t.school,

    suffix: t.suffix ? String(t.suffix) : null,

    city: t.city ? String(t.city) : null,

    state: String(t.state ?? ""),

    schoolAbbreviation: t.schoolAbbreviation ?? null,

    track: t.trackName ?? null,

    exhibition: Boolean(t.exhibition),

    disqualified: Boolean(t.disqualified),

    rank: num(t.rank),

    points: num(t.points),

    trackRank: t.track ? num(t.trackRank) : null,

    trackPoints: t.track ? num(t.trackPoints) : null,

    earnedBid: t.earnedBid ?? null,

    penaltyPoints: penaltyByTeam.get(t.number) ?? 0,

    medalCounts: t.medalCounts ?? null,

  }));



  const placings: ParsedPlacing[] = I.placings.map((p) => {

    let status: ResultStatus;

    if (p.disqualified) status = "disqualified";

    else if (p.didNotParticipate) status = "no_show";

    else if (p.unknown) status = "unknown";

    else if (p.participationOnly) status = "participation_only";

    else if (p.place !== undefined && p.place !== null) status = "placed";

    else status = "unknown";

    return {

      team: p.team!.number,

      event: p.event!.name,

      status,

      place: status === "placed" ? num(p.place) : null,

      tie: Boolean(p.tie),

      exempt: Boolean(p.exempt),

      dropped: Boolean(p.droppedAsPartOfWorstPlacings),

      points: num(p.points),

      isolatedPoints: num(p.isolatedPoints),

      trackPlace: p.team?.track ? num(p.trackPlace) : null,

      medal: typeof p.medal === "number" ? p.medal : null,

      raw: p.rep.raw ?? null,

      affectedByExhibition: Boolean(p.pointsAffectedByExhibition),

    };

  });



  return {

    name: displayName(T.name, T.level, T.location, T.state ?? null),

    shortName: T.shortName ?? null,

    location: T.location ?? null,

    state: T.state ?? null,

    level: T.level,

    division,

    season: T.year,

    startDate: start,

    endDate: end,

    awardsDate: isoDate(rep["awards date"]),

    medals: num(T.medals),

    trophies: num(T.trophies),

    worstPlacingsDropped: T.worstPlacingsDropped ?? 0,

    nOffset: T.nOffset ?? 0,

    reverseScoring: Boolean(T.reverseScoring),

    tracks: I.tracks.map((t) => ({ name: t.name, medals: num(t.medals), trophies: num(t.trophies) })),

    events,

    teams,

    placings,

    penalties,

  };

}


/**
 * SciolyFF makes `name` optional (e.g. Nationals and many States files carry
 * only the host location). Mirror Duosmium's convention for a readable title.
 */
export function displayName(name: string | undefined, level: string, location: string, state: string | null): string {
  if (name && name.trim()) return name.trim();
  if (level === "Nationals") return "Science Olympiad National Tournament";
  if (level === "States") return `${state ?? location} State Tournament`;
  if (level === "Regionals") return `${location} Regional Tournament`;
  return `${location} ${level}`;
}
