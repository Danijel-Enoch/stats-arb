export type AssetClass =
  | "fx"
  | "metals"
  | "energy"
  | "ags"
  | "indices"
  | "equities"
  | "crypto";

export const ASSET_CLASSES: { id: AssetClass; label: string }[] = [
  { id: "fx", label: "FX" },
  { id: "metals", label: "Metals" },
  { id: "energy", label: "Energy" },
  { id: "ags", label: "Ags" },
  { id: "indices", label: "Indices" },
  { id: "equities", label: "Equities" },
  { id: "crypto", label: "Crypto" },
];

/** One tradeable thing, with the symbol each upstream API knows it by. */
export interface Instrument {
  id: string;
  name: string;
  cls: AssetClass;
  /** Yahoo Finance chart symbol (primary candles source). */
  yahoo?: string;
  /** Twelve Data symbol (needs TWELVEDATA_API_KEY for full coverage). */
  twelve?: string;
  /** Frankfurter / ECB daily FX, as [base, quote]. */
  ecb?: [string, string];
  /** Hyperliquid perp coin. */
  hl?: string;
  /** gTrade (Gains Network) perp pair, "FROM/TO". */
  gains?: string;
  /** Pyth feed symbol, e.g. "Metal.XAU/USD". */
  pyth?: string;
  /** CoinGecko coin id. */
  gecko?: string;
  /** Nasdaq quote-service symbol (defaults to the Yahoo one when US-listed). */
  nasdaq?: string;
  /** Alpha Vantage spec: "fx:EUR/USD" | "eq:AAPL" | "cm:WTI". */
  av?: string;
  /**
   * Last-resort US-listed proxy (an ETF that tracks this thing). Used only
   * when every direct provider fails, and always surfaced to the user — a
   * proxy carries tracking error, roll cost and equity-session hours, so it is
   * a different instrument wearing the same name.
   */
  proxy?: string;
  /** What the proxy is, for the disclosure label. */
  proxyNote?: string;
}

export interface Candle {
  /** Unix seconds, bar open. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface Series {
  instrument: string;
  /** Provider id that actually served this series. */
  source: string;
  candles: Candle[];
  /** Set when the series came from the ETF proxy rather than the instrument. */
  proxiedBy?: string;
}

export type TimeframeId = "15m" | "1h" | "4h" | "1d" | "1w";

export interface Timeframe {
  id: TimeframeId;
  label: string;
  /** Bar length in seconds — used for half-life → wall-clock conversion. */
  seconds: number;
  yahoo?: { interval: string; range: string };
  /** Build these bars by folding N of the fetched bars together. */
  fold?: number;
  twelve?: { interval: string; outputsize: number };
  hl?: { interval: string; bars: number };
  /** Daily-only sources (ECB) can serve this timeframe. */
  daily?: boolean;
}

export const TIMEFRAMES: Timeframe[] = [
  {
    id: "15m",
    label: "15m · 5d",
    seconds: 900,
    yahoo: { interval: "15m", range: "5d" },
    twelve: { interval: "15min", outputsize: 500 },
    hl: { interval: "15m", bars: 480 },
  },
  {
    id: "1h",
    label: "1h · 1mo",
    seconds: 3600,
    yahoo: { interval: "1h", range: "1mo" },
    twelve: { interval: "1h", outputsize: 500 },
    hl: { interval: "1h", bars: 500 },
  },
  {
    id: "4h",
    label: "4h · 3mo",
    seconds: 14400,
    yahoo: { interval: "1h", range: "3mo" },
    fold: 4,
    twelve: { interval: "4h", outputsize: 500 },
    hl: { interval: "4h", bars: 500 },
  },
  {
    id: "1d",
    label: "1d · 1y",
    seconds: 86400,
    yahoo: { interval: "1d", range: "1y" },
    twelve: { interval: "1day", outputsize: 400 },
    hl: { interval: "1d", bars: 365 },
    daily: true,
  },
  {
    id: "1w",
    label: "1w · 5y",
    seconds: 604800,
    yahoo: { interval: "1wk", range: "5y" },
    twelve: { interval: "1week", outputsize: 300 },
    hl: { interval: "1w", bars: 260 },
    daily: true,
  },
];

export function timeframe(id: string): Timeframe {
  return TIMEFRAMES.find((t) => t.id === id) ?? TIMEFRAMES[1];
}

export interface ProviderHealth {
  id: string;
  label: string;
  ok: boolean;
  ms: number;
  /** Why it is unusable, when !ok. */
  note?: string;
  /** Needs an API key that is not set. */
  needsKey?: boolean;
  checkedAt: number;
}

export interface CandleProvider {
  id: string;
  label: string;
  /** Lower runs first. */
  priority: number;
  supports(inst: Instrument, tf: Timeframe): boolean;
  probe(): Promise<{ ok: boolean; note?: string; needsKey?: boolean }>;
  fetchCandles(inst: Instrument, tf: Timeframe): Promise<Candle[]>;
}

/** Perp venue listing for one instrument. */
export interface VenueListing {
  venue: string;
  symbol: string;
  /** Round-trip cost estimate in bps (spread + open + close fees). */
  costBps?: number;
  /** Per-hour carry in bps, when the venue publishes one. */
  carryBpsPerHour?: number;
  maxLeverage?: number;
  marketOpen?: boolean;
  note?: string;
}

export interface PairStat {
  a: string;
  b: string;
  clsA: AssetClass;
  clsB: AssetClass;
  n: number;
  /** Pearson correlation of log returns. */
  corr: number;
  /** Spearman (rank) correlation of log returns — robust to outliers. */
  rankCorr: number;
  /** Correlation on the first / second half of the window. */
  corrFirstHalf: number;
  corrSecondHalf: number;
  /** OLS hedge ratio: logA = alpha + beta·logB. */
  beta: number;
  alpha: number;
  /** R² of that regression. */
  r2: number;
  /** Current spread z-score (full-window mean/sd). */
  z: number;
  /** Rolling z-score over the last ~1/3 of the window. */
  zRolling: number;
  /** Spread sd in bps of notional. */
  spreadSdBps: number;
  /** Mean-reversion half-life in bars, and in hours. */
  halfLifeBars: number | null;
  halfLifeHours: number | null;
  /** Augmented Dickey-Fuller t-statistic on the spread (more negative = better). */
  adfT: number;
  /** Stationary at the 5% level (ADF t < -2.86). */
  stationary: boolean;
  /** Hurst exponent — <0.5 mean-reverting, >0.5 trending. */
  hurst: number;
  /** Expected |move| back to the mean, in bps. */
  edgeBps: number;
  /** Round-trip cost of both legs on the cheapest venue pair, in bps. */
  costBps: number | null;
  /** edgeBps − costBps. */
  netBps: number | null;
  /** 0–100 composite. */
  score: number;
  /** Both legs listed as perps somewhere. */
  tradable: boolean;
  venuesA: string[];
  venuesB: string[];
}
