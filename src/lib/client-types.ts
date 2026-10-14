import type { BacktestParams, BacktestResult, EquityPoint, Trade } from "./backtest";
import type { AssetClass, PairStat } from "./types";

/** Shapes the browser receives from the API routes. */

export interface PairLeg {
  id: string;
  name: string;
  cls: AssetClass;
  source: string;
  proxiedBy?: string;
  proxyNote?: string;
}

export interface PairResponse {
  a: PairLeg;
  b: PairLeg;
  tf: string;
  tfLabel: string;
  rollWindow: number;
  t: number[];
  priceA: number[];
  priceB: number[];
  indexA: number[];
  indexB: number[];
  fairA: number[];
  spread: number[];
  z: number[];
  zRolling: number[];
  stat: PairStat | null;
  error?: string;
}

export interface ScanResponse {
  tf: string;
  tfLabel: string;
  classes: string[];
  instrumentsRequested: number;
  instrumentsLive: number;
  pairsTested: number;
  pairsReturned: number;
  sessions: Record<string, boolean>;
  sources: Record<string, number>;
  unavailable: { instrument: string; tried: string[] }[];
  proxied: { instrument: string; proxy: string }[];
  watchlist: string[];
  matrix: { ids: string[]; rows: number[][]; bars: number };
  pairs: PairStat[];
  error?: string;
}

export interface HealthResponse {
  providers: {
    id: string;
    label: string;
    ok: boolean;
    ms: number;
    note?: string;
    needsKey?: boolean;
    checkedAt: number;
  }[];
  anyOk: boolean;
  checkedAt: number;
}

/* ── backtest ───────────────────────────────────────────────────────────── */

export interface BacktestResponse {
  a: PairLeg;
  b: PairLeg;
  tf: string;
  tfLabel: string;
  barSeconds: number;
  dataFrom: number;
  dataTo: number;
  defaults: {
    feeBpsA: number | null;
    feeBpsB: number | null;
    fundingBpsPerDay: number | null;
    maxBars: number;
    maxLeverage: number | null;
    maxLeverageA: number | null;
    maxLeverageB: number | null;
    /** Set to the figure asked for when the venue cap forced it lower. */
    leverageClamped: number | null;
    venuesA: string[];
    venuesB: string[];
  };
  params: BacktestParams;
  bars: number;
  barsTested: number;
  from: number;
  to: number;
  trades: Trade[];
  equity: EquityPoint[];
  summary: BacktestResult["summary"];
  notes: string[];
  error?: string;
}

/** The form holds strings for "leave blank to use the venue default" fields. */
export interface BacktestForm {
  entryZ: number;
  exitZ: number;
  stopZ: number;
  lookback: number;
  maxBars: number | "";
  capital: number;
  leverage: number;
  maintenanceMarginPct: number | "";
  feeBpsA: number | "";
  feeBpsB: number | "";
  fundingBpsPerDay: number | "";
  slippageBps: number;
  side: "both" | "long" | "short";
  from: string;
  to: string;
}
