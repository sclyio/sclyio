/** Numerically stable primitives used by the rating model. */

/** softplus(z) = ln(1 + e^z), stable for large |z|. */
export function softplus(z: number): number {
  if (z > 30) return z + Math.exp(-z);
  if (z < -30) return Math.exp(z);
  return Math.log1p(Math.exp(z));
}

/** inverse_softplus(y) = ln(e^y - 1), defined for y > 0. */
export function inverseSoftplus(y: number): number {
  if (!(y > 0)) {
    throw new RangeError(`inverseSoftplus requires y > 0 (got ${y})`);
  }
  if (y > 30) return y + Math.log1p(-Math.exp(-y));
  if (y < 1e-8) return Math.log(y); // e^y - 1 ≈ y
  return Math.log(Math.expm1(y));
}

/**
 * Placement logit: x = ln((n + 1 - r) / r). Finite for 1 <= r <= n,
 * zero at the middle rank, antisymmetric for mirrored ranks. Midranks
 * (non-integers) are allowed.
 */
export function placementLogit(rank: number, n: number): number {
  if (n < 2) throw new RangeError("placementLogit needs n >= 2");
  if (!(rank >= 1 && rank <= n)) {
    throw new RangeError(`rank ${rank} outside 1..${n}`);
  }
  return Math.log((n + 1 - rank) / rank);
}

/** Public display scale. Zero maps to scaleMax / 2. */
export function toUsr(z: number, scaleMax = 20, spread = 2): number {
  return scaleMax / (1 + Math.exp(-z / spread));
}

export function fromUsr(usr: number, scaleMax = 20, spread = 2): number {
  return -spread * Math.log(scaleMax / usr - 1);
}

/**
 * Midranks for a list of (key, place) where lower place is better.
 * Returns model ranks among exactly the provided participants: equal
 * places share the average of the ranks they occupy.
 */
export function midranks<T>(items: T[], place: (t: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => place(a) - place(b));
  const out = new Map<T, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && place(sorted[j + 1]) === place(sorted[i])) j++;
    const mid = (i + 1 + (j + 1)) / 2;
    for (let q = i; q <= j; q++) out.set(sorted[q], mid);
    i = j + 1;
  }
  return out;
}

/** Effective sample size (sum w)^2 / sum w^2. */
export function effectiveN(weights: number[]): number {
  let s = 0;
  let s2 = 0;
  for (const w of weights) {
    s += w;
    s2 += w * w;
  }
  return s2 > 0 ? (s * s) / s2 : 0;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Spearman rank correlation of two equal-length arrays (average ranks for ties). */
export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return NaN;
  const ra = rankArray(a);
  const rb = rankArray(b);
  return pearson(ra, rb);
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return NaN;
  return sab / Math.sqrt(saa * sbb);
}

function rankArray(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array<number>(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const mid = (i + j) / 2 + 1;
    for (let q = i; q <= j; q++) r[idx[q][1]] = mid;
    i = j + 1;
  }
  return r;
}
