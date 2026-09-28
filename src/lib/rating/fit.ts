/**
 * Regularized additive event-field model (scly.io adaptation).
 *
 *   L = Σ w (s_i − k_t − x_it)² + λs Σ (s_i − prior_i)² + λk Σ k_t²
 *
 * Strictly convex for λs, λk > 0, so the minimizer is unique. The primary
 * solver is Jacobi-preconditioned conjugate gradient on the normal
 * equations (a sparse solve). `fitAlternating` implements the documented
 * deterministic alternating updates and is used as a cross-check;
 * `fitDense` is an independent small-matrix solution used in tests.
 */

export interface Observation {
  entity: number; // index into entities
  field: number; // index into tournament-event fields
  x: number; // placement logit
  w: number; // positive observation weight
}

export interface FitInput {
  nEntities: number;
  nFields: number;
  obs: Observation[];
  lambdaS: number;
  lambdaK: number;
  prior?: Float64Array; // defaults to 0
  tolerance?: number;
  maxIterations?: number;
}

export interface FitResult {
  s: Float64Array;
  k: Float64Array;
  converged: boolean;
  iterations: number;
  method: "cg" | "alternating" | "dense";
  /** Max parameter change of one alternating sweep applied to the solution. */
  fixedPointResidual: number;
  /** Max absolute gradient component at the solution. */
  gradientNorm: number;
}

function sums(input: FitInput) {
  const { nEntities, nFields, obs } = input;
  const Ws = new Float64Array(nEntities);
  const Wk = new Float64Array(nFields);
  const bs = new Float64Array(nEntities);
  const bk = new Float64Array(nFields);
  for (const o of obs) {
    if (!(o.w > 0) || !Number.isFinite(o.x)) {
      throw new RangeError("observations require finite x and positive w");
    }
    Ws[o.entity] += o.w;
    Wk[o.field] += o.w;
    bs[o.entity] += o.w * o.x;
    bk[o.field] -= o.w * o.x;
  }
  return { Ws, Wk, bs, bk };
}

/** One alternating sweep: all s from previous k, then all k from new s. */
function sweep(input: FitInput, s: Float64Array, k: Float64Array, Ws: Float64Array, Wk: Float64Array) {
  const { obs, lambdaS, lambdaK, prior } = input;
  const ns = new Float64Array(s.length);
  const nk = new Float64Array(k.length);
  for (const o of obs) ns[o.entity] += o.w * (o.x + k[o.field]);
  for (let i = 0; i < ns.length; i++) {
    ns[i] = (ns[i] + lambdaS * (prior ? prior[i] : 0)) / (Ws[i] + lambdaS);
  }
  for (const o of obs) nk[o.field] += o.w * (ns[o.entity] - o.x);
  for (let t = 0; t < nk.length; t++) nk[t] = nk[t] / (Wk[t] + lambdaK);
  return { ns, nk };
}

function gradient(input: FitInput, s: Float64Array, k: Float64Array): number {
  const { obs, lambdaS, lambdaK, prior } = input;
  const gs = new Float64Array(s.length);
  const gk = new Float64Array(k.length);
  for (const o of obs) {
    const r = s[o.entity] - k[o.field] - o.x;
    gs[o.entity] += o.w * r;
    gk[o.field] -= o.w * r;
  }
  let m = 0;
  for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(gs[i] + lambdaS * (s[i] - (prior ? prior[i] : 0))));
  for (let t = 0; t < k.length; t++) m = Math.max(m, Math.abs(gk[t] + lambdaK * k[t]));
  return m;
}

function diagnostics(input: FitInput, s: Float64Array, k: Float64Array, Ws: Float64Array, Wk: Float64Array) {
  const { ns, nk } = sweep(input, s, k, Ws, Wk);
  let d = 0;
  for (let i = 0; i < s.length; i++) d = Math.max(d, Math.abs(ns[i] - s[i]));
  for (let t = 0; t < k.length; t++) d = Math.max(d, Math.abs(nk[t] - k[t]));
  return { fixedPointResidual: d, gradientNorm: gradient(input, s, k) };
}

/** Deterministic alternating updates, initialized at zero (reference method). */
export function fitAlternating(input: FitInput): FitResult {
  const tol = input.tolerance ?? 1e-7;
  const maxIt = input.maxIterations ?? 10_000;
  const { Ws, Wk } = sums(input);
  let s = new Float64Array(input.nEntities);
  let k = new Float64Array(input.nFields);
  let it = 0;
  let converged = false;
  while (it < maxIt) {
    it++;
    const { ns, nk } = sweep(input, s, k, Ws, Wk);
    let d = 0;
    for (let i = 0; i < ns.length; i++) d = Math.max(d, Math.abs(ns[i] - s[i]));
    for (let t = 0; t < nk.length; t++) d = Math.max(d, Math.abs(nk[t] - k[t]));
    s = ns;
    k = nk;
    if (d < tol) {
      converged = true;
      break;
    }
  }
  return { s, k, converged, iterations: it, method: "alternating", ...diagnostics(input, s, k, Ws, Wk) };
}

/**
 * Jacobi-preconditioned conjugate gradient on the normal equations.
 * Unknowns are packed as [s_0..s_{E-1}, k_0..k_{T-1}].
 */
export function fitCG(input: FitInput): FitResult {
  const tol = input.tolerance ?? 1e-7;
  const maxIt = input.maxIterations ?? 10_000;
  const E = input.nEntities;
  const T = input.nFields;
  const N = E + T;
  const { Ws, Wk, bs, bk } = sums(input);
  const { obs, lambdaS, lambdaK, prior } = input;

  const b = new Float64Array(N);
  const diag = new Float64Array(N);
  for (let i = 0; i < E; i++) {
    b[i] = bs[i] + lambdaS * (prior ? prior[i] : 0);
    diag[i] = Ws[i] + lambdaS;
  }
  for (let t = 0; t < T; t++) {
    b[E + t] = bk[t];
    diag[E + t] = Wk[t] + lambdaK;
  }
  const oe = new Int32Array(obs.length);
  const of = new Int32Array(obs.length);
  const ow = new Float64Array(obs.length);
  obs.forEach((o, j) => {
    oe[j] = o.entity;
    of[j] = E + o.field;
    ow[j] = o.w;
  });
  const matvec = (v: Float64Array, out: Float64Array) => {
    for (let i = 0; i < N; i++) out[i] = diag[i] * v[i];
    for (let j = 0; j < oe.length; j++) {
      const a = oe[j];
      const c = of[j];
      out[a] -= ow[j] * v[c];
      out[c] -= ow[j] * v[a];
    }
  };

  const x = new Float64Array(N);
  const r = Float64Array.from(b);
  const z = new Float64Array(N);
  for (let i = 0; i < N; i++) z[i] = r[i] / diag[i];
  const p = Float64Array.from(z);
  const Ap = new Float64Array(N);
  let rz = 0;
  for (let i = 0; i < N; i++) rz += r[i] * z[i];
  let it = 0;
  let converged = false;
  while (N > 0 && it < maxIt) {
    it++;
    matvec(p, Ap);
    let pAp = 0;
    for (let i = 0; i < N; i++) pAp += p[i] * Ap[i];
    if (!(pAp > 0)) break; // exact solution reached (p = 0)
    const alpha = rz / pAp;
    let maxRes = 0;
    for (let i = 0; i < N; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
      if (Math.abs(r[i]) > maxRes) maxRes = Math.abs(r[i]);
    }
    if (maxRes < tol * 1e-3) break;
    let rzNew = 0;
    for (let i = 0; i < N; i++) {
      z[i] = r[i] / diag[i];
      rzNew += r[i] * z[i];
    }
    if (rzNew === 0) break;
    const beta = rzNew / rz;
    rz = rzNew;
    for (let i = 0; i < N; i++) p[i] = z[i] + beta * p[i];
  }
  const s = x.slice(0, E);
  const k = x.slice(E);
  const diag2 = diagnostics(input, s, k, Ws, Wk);
  // Publish only if the solution satisfies the documented alternating-update
  // stopping criterion (one sweep moves no parameter by >= tol) and the
  // normal-equation gradient vanishes.
  converged = diag2.fixedPointResidual < tol && diag2.gradientNorm < tol;
  return { s, k, converged, iterations: it, method: "cg", ...diag2 };
}

/** Dense Gaussian elimination on the normal equations. Tests only. */
export function fitDense(input: FitInput): FitResult {
  const E = input.nEntities;
  const T = input.nFields;
  const N = E + T;
  const A: number[][] = Array.from({ length: N }, () => new Array<number>(N + 1).fill(0));
  const { lambdaS, lambdaK, prior } = input;
  for (let i = 0; i < E; i++) {
    A[i][i] += lambdaS;
    A[i][N] += lambdaS * (prior ? prior[i] : 0);
  }
  for (let t = 0; t < T; t++) A[E + t][E + t] += lambdaK;
  for (const o of input.obs) {
    const i = o.entity;
    const t = E + o.field;
    A[i][i] += o.w;
    A[i][t] -= o.w;
    A[i][N] += o.w * o.x;
    A[t][t] += o.w;
    A[t][i] -= o.w;
    A[t][N] -= o.w * o.x;
  }
  for (let c = 0; c < N; c++) {
    let piv = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < N; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let q = c; q <= N; q++) A[r][q] -= f * A[c][q];
    }
  }
  const sol = A.map((row, i) => row[N] / row[i]);
  const s = Float64Array.from(sol.slice(0, E));
  const k = Float64Array.from(sol.slice(E));
  const { Ws, Wk } = sums(input);
  return { s, k, converged: true, iterations: 1, method: "dense", ...diagnostics(input, s, k, Ws, Wk) };
}

/** Normalize weights to mean 1 in place; returns the scale factor applied. */
export function normalizeWeights(obs: Observation[]): number {
  if (obs.length === 0) return 1;
  let sum = 0;
  for (const o of obs) sum += o.w;
  const f = obs.length / sum;
  for (const o of obs) o.w *= f;
  return f;
}
