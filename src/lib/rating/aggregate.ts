import { inverseSoftplus, softplus } from "./math";

/**
 * School Potential event summary (reference-inspired softplus generalized
 * mean, with an explicit scly.io prior term λs·softplus(0)):
 *   q = inverse_softplus( (Σ w·softplus(x + k) + λs·softplus(0)) / (Σ w + λs) )
 */
export function potentialSummary(
  adjusted: { value: number; w: number }[],
  lambdaS: number,
): number {
  let num = lambdaS * softplus(0);
  let den = lambdaS;
  for (const a of adjusted) {
    num += a.w * softplus(a.value);
    den += a.w;
  }
  return inverseSoftplus(num / den);
}

/**
 * Team Performance overall: mean of fitted event skills over all M official
 * slots; missing / non-comparable slots use the latent prior 0.
 */
export function teamOverall(eventSkills: (number | null)[], M: number): number {
  if (M <= 0) throw new RangeError("M must be positive");
  let sum = 0;
  for (const v of eventSkills) if (v !== null) sum += v;
  return sum / M;
}

/**
 * School Potential overall: inverse_softplus(mean over M slots of
 * softplus(q)), with q = 0 for missing / non-comparable slots. This missing-
 * event prior deliberately differs from the reference aggregate.
 */
export function schoolOverall(eventQ: (number | null)[], M: number): number {
  if (M <= 0) throw new RangeError("M must be positive");
  let sum = 0;
  let present = 0;
  for (const v of eventQ) {
    if (v !== null) {
      sum += softplus(v);
      present++;
    }
  }
  sum += (M - present) * softplus(0);
  return inverseSoftplus(sum / M);
}

/**
 * The reference spreadsheet's displayed overall aggregate (Div B FINAL!G2):
 *   LN(EXP(SUM(softplus(present events)) / MAX(COUNT(events), 23)) − 1)
 * Absent events contribute nothing to the transformed sum. Used only for
 * aggregation regression checks — not the scly.io model.
 */
export function referenceAggregate(events: (number | null)[], slots = 23): number {
  let sum = 0;
  let count = 0;
  for (const v of events) {
    if (v !== null) {
      sum += softplus(v);
      count++;
    }
  }
  return inverseSoftplus(sum / Math.max(count, slots));
}
