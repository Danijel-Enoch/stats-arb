import type { AssetClass, Candle, PairStat, Series, Timeframe } from "./types";

/* ── primitives ─────────────────────────────────────────────────────────── */

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function sd(xs: number[], ddof = 1): number {
  const n = xs.length;
  if (n <= ddof) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (n - ddof));
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    // average rank over the tie group
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k].i] = r;
    i = j + 1;
  }
  return out;
}

export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  return pearson(ranks(xs.slice(0, n)), ranks(ys.slice(0, n)));
}

/** Ordinary least squares y = alpha + beta·x. */
export function ols(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const beta = sxx === 0 ? 0 : sxy / sxx;
  const alpha = my - beta * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const fit = alpha + beta * xs[i];
    ssRes += (ys[i] - fit) * (ys[i] - fit);
    ssTot += (ys[i] - my) * (ys[i] - my);
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { alpha, beta, r2 };
}

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
    else out.push(0);
  }
  return out;
}

/**
 * AR(1) fit on the spread: Δs_t = a + b·s_{t−1} + ε.
 *  • half-life  = −ln2 / ln(1+b)       (bars until half the gap closes)
 *  • ADF t-stat = b / se(b)            (Dickey–Fuller, no lags; 5% crit ≈ −2.86)
 */
export function meanReversion(spread: number[]) {
  const n = spread.length;
  if (n < 20) return { halfLife: null as number | null, adfT: 0, phi: 1 };
  const lag: number[] = [];
  const dif: number[] = [];
  for (let i = 1; i < n; i++) {
    lag.push(spread[i - 1]);
    dif.push(spread[i] - spread[i - 1]);
  }
  const { alpha, beta } = ols(lag, dif);
  const m = lag.length;
  // residual standard error of the slope
  let ssRes = 0;
  for (let i = 0; i < m; i++) {
    const e = dif[i] - (alpha + beta * lag[i]);
    ssRes += e * e;
  }
  const mx = mean(lag);
  let sxx = 0;
  for (const x of lag) sxx += (x - mx) * (x - mx);
  const se = sxx > 0 && m > 2 ? Math.sqrt(ssRes / (m - 2) / sxx) : Infinity;
  const adfT = se === 0 || !isFinite(se) ? 0 : beta / se;
  const phi = 1 + beta;
  const halfLife = phi > 0 && phi < 1 ? -Math.LN2 / Math.log(phi) : null;
  return { halfLife, adfT, phi };
}

/**
 * Hurst exponent by aggregated variance: var of k-aggregated increments scales
 * as k^(2H). < 0.5 mean-reverting, 0.5 random walk, > 0.5 trending.
 */
export function hurst(series: number[]): number {
  const n = series.length;
  if (n < 32) return 0.5;
  const lags = [2, 4, 8, 16, 32].filter((k) => k * 4 <= n);
  if (lags.length < 3) return 0.5;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const k of lags) {
    const diffs: number[] = [];
    for (let i = k; i < n; i += k) diffs.push(series[i] - series[i - k]);
    const s = sd(diffs);
    if (s <= 0) continue;
    xs.push(Math.log(k));
    ys.push(Math.log(s));
  }
  if (xs.length < 3) return 0.5;
  const { beta } = ols(xs, ys);
  return Math.min(1, Math.max(0, beta));
}

/* ── alignment ──────────────────────────────────────────────────────────── */

/**
 * Inner-join two candle series on bar timestamp. Different asset classes keep
 * different sessions (FX trades when the NYSE is shut), so an inner join is the
 * only honest way to correlate them — no forward-filling a closed market into
 * an open one, which manufactures correlation out of nothing.
 */
export function alignPair(a: Candle[], b: Candle[]) {
  const mb = new Map<number, number>();
  for (const c of b) mb.set(c.t, c.c);
  const t: number[] = [];
  const pa: number[] = [];
  const pb: number[] = [];
  for (const c of a) {
    const other = mb.get(c.t);
    if (other !== undefined && c.c > 0 && other > 0) {
      t.push(c.t);
      pa.push(c.c);
      pb.push(other);
    }
  }
  return { t, pa, pb };
}

/** Align N series on the timestamps every one of them has. */
export function alignMany(series: Series[]) {
  if (!series.length) return { t: [] as number[], prices: [] as number[][] };
  const maps = series.map((s) => {
    const m = new Map<number, number>();
    for (const c of s.candles) if (c.c > 0) m.set(c.t, c.c);
    return m;
  });
  let keys = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) keys = keys.filter((k) => maps[i].has(k));
  keys.sort((x, y) => x - y);
  return { t: keys, prices: maps.map((m) => keys.map((k) => m.get(k)!)) };
}

/* ── the pair model ─────────────────────────────────────────────────────── */

export interface SpreadModel {
  t: number[];
  pa: number[];
  pb: number[];
  /** logA − (alpha + beta·logB), the tradeable residual. */
  spread: number[];
  z: number[];
  alpha: number;
  beta: number;
  spreadMean: number;
  spreadSd: number;
  /** Price of A implied by B through the fitted relationship. */
  fairA: number[];
}

export function buildSpread(a: Candle[], b: Candle[]): SpreadModel | null {
  const { t, pa, pb } = alignPair(a, b);
  if (t.length < 30) return null;
  const la = pa.map(Math.log);
  const lb = pb.map(Math.log);
  const { alpha, beta, r2: _r2 } = ols(lb, la);
  void _r2;
  const spread = la.map((v, i) => v - (alpha + beta * lb[i]));
  const spreadMean = mean(spread);
  const spreadSd = sd(spread) || 1e-12;
  return {
    t,
    pa,
    pb,
    spread,
    z: spread.map((s) => (s - spreadMean) / spreadSd),
    alpha,
    beta,
    spreadMean,
    spreadSd,
    fairA: lb.map((v) => Math.exp(alpha + beta * v)),
  };
}

/** Rolling z-score with the given window, for the spread panel. */
export function rollingZ(spread: number[], win: number): number[] {
  const out = new Array<number>(spread.length).fill(0);
  for (let i = 0; i < spread.length; i++) {
    const from = Math.max(0, i - win + 1);
    const slice = spread.slice(from, i + 1);
    if (slice.length < 8) continue;
    const m = mean(slice);
    const s = sd(slice) || 1e-12;
    out[i] = (spread[i] - m) / s;
  }
  return out;
}

export interface PairCosts {
  /** Round-trip bps for one leg, per instrument id. null = not perp-listed. */
  costBps: Map<string, number | null>;
  venues: Map<string, string[]>;
}

export function computePair(
  aId: string,
  bId: string,
  clsA: AssetClass,
  clsB: AssetClass,
  a: Candle[],
  b: Candle[],
  tf: Timeframe,
  costs?: PairCosts,
): PairStat | null {
  const model = buildSpread(a, b);
  if (!model) return null;
  const { t, pa, pb, spread, alpha, beta, spreadSd } = model;
  const n = t.length;

  const ra = logReturns(pa);
  const rb = logReturns(pb);
  const corr = pearson(ra, rb);
  const rankCorr = spearman(ra, rb);
  const half = Math.floor(ra.length / 2);
  const corrFirstHalf = pearson(ra.slice(0, half), rb.slice(0, half));
  const corrSecondHalf = pearson(ra.slice(half), rb.slice(half));

  const la = pa.map(Math.log);
  const lb = pb.map(Math.log);
  const { r2 } = ols(lb, la);

  const mr = meanReversion(spread);
  const h = hurst(spread);

  const zNow = (spread[n - 1] - mean(spread)) / spreadSd;
  const rollWin = Math.max(20, Math.floor(n / 3));
  const rz = rollingZ(spread, rollWin);
  const zRolling = rz[n - 1];

  // A spread of x in log space is ~x·10_000 bps of notional on the A leg.
  const spreadSdBps = spreadSd * 10_000;
  const edgeBps = Math.abs(zNow) * spreadSdBps;

  const cA = costs?.costBps.get(aId) ?? null;
  const cB = costs?.costBps.get(bId) ?? null;
  // The B leg is sized at |beta| of the A leg, so its cost scales with beta.
  const costBps =
    cA === null || cB === null ? null : cA + cB * Math.min(4, Math.abs(beta));
  const netBps = costBps === null ? null : edgeBps - costBps;

  const venuesA = costs?.venues.get(aId) ?? [];
  const venuesB = costs?.venues.get(bId) ?? [];

  return {
    a: aId,
    b: bId,
    clsA,
    clsB,
    n,
    corr,
    rankCorr,
    corrFirstHalf,
    corrSecondHalf,
    beta,
    alpha,
    r2,
    z: zNow,
    zRolling,
    spreadSdBps,
    halfLifeBars: mr.halfLife,
    halfLifeHours: mr.halfLife === null ? null : (mr.halfLife * tf.seconds) / 3600,
    adfT: mr.adfT,
    stationary: mr.adfT < -2.86,
    hurst: h,
    edgeBps,
    costBps,
    netBps,
    score: 0, // filled by scorePair
    tradable: venuesA.length > 0 && venuesB.length > 0,
    venuesA,
    venuesB,
  };
}

/**
 * Composite 0–100. Every term is something a relative-value desk would
 * actually check, and each is reported separately in the table so the ranking
 * is never a black box.
 */
export function scorePair(p: PairStat, barsInWindow: number): number {
  const ac = Math.abs(p.corr);
  // 1. co-movement — below 0.5 there is no relationship to trade
  const sCorr = clamp01((ac - 0.5) / 0.45) * 26;
  // 2. stability — a correlation that only exists in one half is a mirage
  const stab =
    Math.sign(p.corrFirstHalf) === Math.sign(p.corrSecondHalf)
      ? clamp01(1 - Math.abs(Math.abs(p.corrFirstHalf) - Math.abs(p.corrSecondHalf)) / 0.5)
      : 0;
  const sStab = stab * 16;
  // 3. stationarity of the residual — the actual cointegration test
  const sAdf = clamp01((-p.adfT - 1.5) / 2.0) * 22;
  // 4. mean-reverting rather than trending residual
  const sHurst = clamp01((0.55 - p.hurst) / 0.3) * 10;
  // 5. half-life in a tradeable band: a few bars to a third of the window
  let sHl = 0;
  if (p.halfLifeBars !== null) {
    const hl = p.halfLifeBars;
    const lo = 2;
    const hi = Math.max(10, barsInWindow / 3);
    sHl = hl >= lo && hl <= hi ? 12 * (1 - Math.abs(Math.log(hl / Math.sqrt(lo * hi))) / Math.log(hi / lo)) : 0;
    sHl = Math.max(0, sHl);
  }
  // 6. there is a dislocation on right now, and it clears costs
  const sZ = clamp01((Math.abs(p.zRolling) - 1.0) / 1.5) * 10;
  const sNet = p.netBps === null ? 2 : clamp01(p.netBps / 60) * 4;

  return Math.round(Math.min(100, sCorr + sStab + sAdf + sHurst + sHl + sZ + sNet));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Index a price series to 100 at the first bar — the honest way to overlay. */
export function indexTo100(prices: number[]): number[] {
  const base = prices.find((p) => p > 0);
  if (!base) return prices.map(() => 100);
  return prices.map((p) => (p / base) * 100);
}
