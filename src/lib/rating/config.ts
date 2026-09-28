/**
 * Versioned model parameters for the scly.io experimental v2 rating model.
 *
 * Every value here is a starting hypothesis, not an empirically validated
 * constant. Changing any value must bump MODEL_VERSION so stored snapshots
 * remain traceable to the parameters that produced them.
 */
/**
 * v2-exp.1: lambdaS = 2 (starting hypothesis).
 * v2-exp.2: lambdaS = 1, selected on the validation split only (see
 * docs/backtest.md); all other parameters unchanged.
 */
export const MODEL_VERSION = "v2-exp.2";
export const PARSER_VERSION = "duosmium-adapter/1.1.0";

export interface ModelParams {
  /** Rolling window: only results completed within this many days of as-of. */
  windowDays: number;
  /** Recency decay constant in exp(-age_days / decayDays). */
  decayDays: number;
  /** Exponent on unique eligible schools in the event field. */
  fieldSizeExponent: number;
  /** format_weight for explicitly online / satellite tournaments. */
  onlineWeight: number;
  /** format_weight when format is unknown (flagged). */
  unknownFormatWeight: number;
  /** Ridge penalty on entity skills toward prior (0). */
  lambdaS: number;
  /** Ridge penalty on tournament-event field offsets toward 0. */
  lambdaK: number;
  /** Convergence tolerance on the maximum parameter change. */
  tolerance: number;
  maxIterations: number;
  /** Eligibility: minimum distinct eligible tournaments for a national overall rank. */
  minTournaments: number;
  /**
   * Eligibility: minimum fraction of the M official events that must be
   * nationally comparable (1 = all M events, the documented default).
   */
  minComparableEventFraction: number;
  /** A rated profile with no eligible result within this many days is "inactive". */
  inactiveAfterDays: number;
  /** Display-scale mapping: USR = scaleMax / (1 + exp(-z / scaleSpread)). */
  scaleMax: number;
  scaleSpread: number;
}

export const DEFAULT_PARAMS: ModelParams = {
  windowDays: 400,
  decayDays: 200,
  fieldSizeExponent: 0.25,
  onlineWeight: 0.5,
  unknownFormatWeight: 1,
  lambdaS: 1,
  lambdaK: 1,
  tolerance: 1e-7,
  maxIterations: 10_000,
  minTournaments: 3,
  minComparableEventFraction: 1,
  inactiveAfterDays: 180,
  scaleMax: 20,
  scaleSpread: 2,
};

/** Original overall-placement Elo, retained only as a backtesting baseline. */
export const ELO_V1 = {
  version: "v1-elo",
  initial: 1500,
  k: 48,
  scale: 400,
} as const;

export type RatingView = "team" | "school";
export type Division = "B" | "C";
export const DIVISIONS: Division[] = ["B", "C"];
export const VIEWS: RatingView[] = ["team", "school"];

export const VIEW_LABEL: Record<RatingView, string> = {
  team: "Team Performance",
  school: "School Potential",
};
