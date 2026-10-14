import { mean, meanReversion, ols, sd } from "./stats";
import type { Timeframe } from "./types";

/* ───────────────────────────────────────────────────────────────────────────
   Walk-forward pair backtest.

   The hedge ratio and the spread's mean and σ are refit at every bar using
   ONLY the bars before it, and a position holds the β it was opened with. That
   matters: fitting β over the whole sample and then "trading" it is the single
   most common way a pairs backtest invents returns that were never available.
   ─────────────────────────────────────────────────────────────────────────── */

export interface BacktestParams {
  /** Bars of history used to fit β, mean and σ before each decision. */
  lookback: number;
  /** |z| that opens a position. */
  entryZ: number;
  /** |z| that closes it at a profit. */
  exitZ: number;
  /** |z| that stops it out — the spread kept widening. */
  stopZ: number;
  /** Hard time stop, in bars. 0 = none. */
  maxBars: number;
  /** Notional on leg A per trade. Leg B is sized at |β| × this. */
  capital: number;
  /**
   * Leverage. Does not change position size — it changes how much margin the
   * same position requires, and therefore the return on that margin and
   * whether the position can be liquidated before its stop is reached.
   *
   *   margin = (notionalA + notionalB) / leverage
   */
  leverage: number;
  /**
   * Maintenance margin, as a percentage of gross notional. The position is
   * liquidated when its equity falls to this. Venue defaults sit near 0.5%.
   */
  maintenanceMarginPct: number;
  /** Round-trip cost in bps for each leg; venue values unless overridden. */
  feeBpsA: number;
  feeBpsB: number;
  /** Funding/borrow carry in bps per day, charged on gross notional. */
  fundingBpsPerDay: number;
  /** Slippage in bps charged on each leg per round trip. */
  slippageBps: number;
  /** Restrict to one side of the spread. */
  side: "both" | "long" | "short";
  /** Inclusive unix-second bounds; 0 = unbounded. */
  from: number;
  to: number;
}

export const DEFAULT_PARAMS: BacktestParams = {
  lookback: 90,
  entryZ: 2,
  exitZ: 0.5,
  stopZ: 4,
  maxBars: 0,
  capital: 10_000,
  leverage: 1,
  maintenanceMarginPct: 0.5,
  feeBpsA: 10,
  feeBpsB: 10,
  fundingBpsPerDay: 1,
  slippageBps: 2,
  side: "both",
  from: 0,
  to: 0,
};

export type ExitReason = "target" | "stop" | "time" | "end of data" | "liquidated";

export interface Trade {
  id: number;
  /** "long" = long the spread (long A, short B); "short" = the reverse. */
  side: "long" | "short";
  entryT: number;
  exitT: number;
  bars: number;
  days: number;
  entryZ: number;
  exitZ: number;
  beta: number;
  entryA: number;
  exitA: number;
  entryB: number;
  exitB: number;
  notionalA: number;
  notionalB: number;
  /** Margin posted for this trade: gross notional ÷ leverage. */
  margin: number;
  /** Per-leg PnL before costs. */
  pnlA: number;
  pnlB: number;
  grossPnl: number;
  fees: number;
  funding: number;
  slippage: number;
  netPnl: number;
  /** Return on the margin posted, which is what leverage actually amplifies. */
  returnPct: number;
  win: boolean;
  liquidated: boolean;
  reason: ExitReason;
}

export interface EquityPoint {
  t: number;
  /** Realised PnL only. */
  realised: number;
  /** Realised + open mark-to-market. */
  equity: number;
  /** Open position marker, for shading the chart. */
  inTrade: 0 | 1 | -1;
}

export interface BacktestResult {
  params: BacktestParams;
  bars: number;
  barsTested: number;
  from: number;
  to: number;
  trades: Trade[];
  equity: EquityPoint[];
  summary: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    grossPnl: number;
    fees: number;
    funding: number;
    slippage: number;
    netPnl: number;
    /** Net P&L over the notional on leg A — unaffected by leverage. */
    returnOnCapitalPct: number;
    /** Net P&L over the margin actually posted — this is what leverage moves. */
    returnOnMarginPct: number;
    /** Average margin posted per trade; it varies with β. */
    avgMargin: number;
    liquidations: number;
    avgTrade: number;
    avgWin: number;
    avgLoss: number;
    /**
     * Gross wins ÷ gross losses. null when there were no losing trades, so the
     * ratio is undefined rather than infinite — JSON cannot carry Infinity
     * (it serialises to null), so producing it here would arrive at the client
     * as an indistinguishable null.
     */
    profitFactor: number | null;
    expectancy: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    sharpe: number;
    avgBarsHeld: number;
    avgDaysHeld: number;
    exposurePct: number;
    bestTrade: number;
    worstTrade: number;
    exits: Record<ExitReason, number>;
  };
  /** Non-fatal notes about the run — short windows, clamped ranges, etc. */
  notes: string[];
}

interface Open {
  side: "long" | "short";
  entryIndex: number;
  entryT: number;
  entryZ: number;
  beta: number;
  alpha: number;
  spreadMean: number;
  spreadSd: number;
  entryA: number;
  entryB: number;
  notionalA: number;
  notionalB: number;
  margin: number;
  maintenance: number;
}

export function runBacktest(
  t: number[],
  pa: number[],
  pb: number[],
  tf: Timeframe,
  input: Partial<BacktestParams>,
): BacktestResult {
  const p: BacktestParams = { ...DEFAULT_PARAMS, ...input };
  const notes: string[] = [];

  // Clamp the window to what the data actually covers.
  const from = p.from || t[0];
  const to = p.to || t[t.length - 1];
  const startIdx = Math.max(0, t.findIndex((x) => x >= from));
  let endIdx = t.length - 1;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] <= to) {
      endIdx = i;
      break;
    }
  }
  if (endIdx <= startIdx) {
    return empty(p, t, notes.concat("The selected range contains no shared bars."));
  }

  const la = pa.map(Math.log);
  const lb = pb.map(Math.log);

  // The fit window may reach back before the selected range — that is history,
  // not lookahead, so it is allowed and is why trading can start on bar one.
  let lookback = p.lookback;
  if (lookback > startIdx + 1 && lookback > endIdx - startIdx) {
    const fit = Math.max(20, Math.floor((endIdx - startIdx) / 3));
    if (fit < lookback) {
      notes.push(`Lookback shortened from ${lookback} to ${fit} bars — the range is too short for the full fit.`);
      lookback = fit;
    }
  }

  const barSeconds = tf.seconds;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  let realised = 0;
  let open: Open | null = null;
  let barsInTrade = 0;
  let tested = 0;
  let tradeId = 0;

  for (let i = Math.max(startIdx, lookback); i <= endIdx; i++) {
    tested++;
    const win0 = i - lookback;
    const fitA = la.slice(win0, i);
    const fitB = lb.slice(win0, i);
    const { alpha, beta } = ols(fitB, fitA);
    const fitSpread = fitA.map((v, k) => v - (alpha + beta * fitB[k]));
    const m = mean(fitSpread);
    const s = sd(fitSpread) || 1e-12;

    // z for a NEW position uses the freshly fit relationship …
    const zNew = (la[i] - (alpha + beta * lb[i])) - m;
    const z = zNew / s;

    if (open) {
      barsInTrade++;
      // … but an open position is marked against the β it was opened with,
      // because that is the hedge actually on the books.
      const zHeld =
        (la[i] - (open.alpha + open.beta * lb[i]) - open.spreadMean) / open.spreadSd;

      // Liquidation is checked first: the venue closes you out before your own
      // stop can fire, and at leverage the two are nowhere near each other.
      const openPnl = markToMarket(open, pa[i], pb[i], barsInTrade, barSeconds, p);
      const equity = open.margin + openPnl - roundTripCosts(open, p);

      let reason: ExitReason | null = null;
      if (equity <= open.maintenance) reason = "liquidated";
      else if (Math.abs(zHeld) <= p.exitZ) reason = "target";
      else if (Math.abs(zHeld) >= p.stopZ) reason = "stop";
      else if (p.maxBars > 0 && barsInTrade >= p.maxBars) reason = "time";
      else if (i === endIdx) reason = "end of data";

      if (reason) {
        const tr = close(open, i, t[i], zHeld, pa[i], pb[i], barsInTrade, barSeconds, p, ++tradeId, reason);
        trades.push(tr);
        realised += tr.netPnl;
        open = null;
        barsInTrade = 0;
      }
    }

    if (!open && Math.abs(z) >= p.entryZ && i < endIdx) {
      // z above +entry means A is rich against B → short the spread.
      const side: "long" | "short" = z > 0 ? "short" : "long";
      const allowed = p.side === "both" || p.side === side;
      if (allowed && isFinite(beta) && Math.abs(beta) > 1e-6) {
        const notionalB = p.capital * Math.min(5, Math.abs(beta));
        const gross = p.capital + notionalB;
        open = {
          side,
          entryIndex: i,
          entryT: t[i],
          entryZ: z,
          beta,
          alpha,
          spreadMean: m,
          spreadSd: s,
          entryA: pa[i],
          entryB: pb[i],
          notionalA: p.capital,
          notionalB,
          margin: gross / Math.max(1, p.leverage),
          maintenance: (gross * p.maintenanceMarginPct) / 100,
        };
        barsInTrade = 0;
      }
    }

    equity.push({
      t: t[i],
      realised,
      equity: realised + (open ? markToMarket(open, pa[i], pb[i], barsInTrade, barSeconds, p) : 0),
      inTrade: open ? (open.side === "long" ? 1 : -1) : 0,
    });
  }

  return {
    params: { ...p, lookback, from: t[startIdx], to: t[endIdx] },
    bars: t.length,
    barsTested: tested,
    from: t[startIdx],
    to: t[endIdx],
    trades,
    equity,
    summary: summarise(trades, equity, p, tested, barSeconds),
    notes,
  };
}

/** Open PnL before exit costs — entry costs are already sunk. */
function markToMarket(o: Open, a: number, b: number, bars: number, barSeconds: number, p: BacktestParams): number {
  const dirA = o.side === "long" ? 1 : -1;
  const pnlA = dirA * o.notionalA * (a / o.entryA - 1);
  const pnlB = -dirA * o.notionalB * (b / o.entryB - 1);
  const days = (bars * barSeconds) / 86_400;
  const funding = ((o.notionalA + o.notionalB) * p.fundingBpsPerDay * days) / 10_000;
  return pnlA + pnlB - funding;
}

/** Fees and slippage for a round trip, independent of how it ends. */
function roundTripCosts(o: Open, p: BacktestParams): number {
  const fees = (o.notionalA * p.feeBpsA + o.notionalB * p.feeBpsB) / 10_000;
  const slippage = ((o.notionalA + o.notionalB) * p.slippageBps) / 10_000;
  return fees + slippage;
}

function close(
  o: Open,
  exitIndex: number,
  exitT: number,
  exitZ: number,
  exitA: number,
  exitB: number,
  bars: number,
  barSeconds: number,
  p: BacktestParams,
  id: number,
  reason: ExitReason,
): Trade {
  void exitIndex;
  const dirA = o.side === "long" ? 1 : -1;
  const pnlA = dirA * o.notionalA * (exitA / o.entryA - 1);
  const pnlB = -dirA * o.notionalB * (exitB / o.entryB - 1);
  const grossPnl = pnlA + pnlB;

  const fees = (o.notionalA * p.feeBpsA + o.notionalB * p.feeBpsB) / 10_000;
  const slippage = ((o.notionalA + o.notionalB) * p.slippageBps) / 10_000;
  const days = (bars * barSeconds) / 86_400;
  const funding = ((o.notionalA + o.notionalB) * p.fundingBpsPerDay * days) / 10_000;
  // A liquidated position loses the margin posted and no more — the venue
  // closes it; you cannot lose past your collateral on an isolated-margin perp.
  const liquidated = reason === "liquidated";
  const netPnl = liquidated ? -o.margin : grossPnl - fees - slippage - funding;

  return {
    id,
    side: o.side,
    entryT: o.entryT,
    exitT,
    bars,
    days,
    entryZ: o.entryZ,
    exitZ,
    beta: o.beta,
    entryA: o.entryA,
    exitA,
    entryB: o.entryB,
    exitB,
    notionalA: o.notionalA,
    notionalB: o.notionalB,
    pnlA,
    pnlB,
    grossPnl,
    fees,
    funding,
    slippage,
    margin: o.margin,
    netPnl,
    returnPct: (netPnl / o.margin) * 100,
    win: netPnl > 0,
    liquidated,
    reason,
  };
}

function summarise(
  trades: Trade[],
  equity: EquityPoint[],
  p: BacktestParams,
  barsTested: number,
  barSeconds: number,
): BacktestResult["summary"] {
  const wins = trades.filter((t) => t.win);
  const losses = trades.filter((t) => !t.win);
  const grossWin = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);

  let peak = 0;
  let maxDd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.equity);
    maxDd = Math.max(maxDd, peak - e.equity);
  }

  const avgMargin = trades.length ? trades.reduce((s, t) => s + t.margin, 0) / trades.length : 0;
  // Risk-adjusted return is measured on the capital actually at risk.
  const rets = trades.map((t) => (t.margin > 0 ? t.netPnl / t.margin : 0));
  const mu = mean(rets);
  const sigma = sd(rets);
  // Annualise by how often a trade actually happens, not by calendar guesswork.
  const barsPerYear = (365 * 86_400) / barSeconds;
  const tradesPerYear = barsTested > 0 ? (trades.length / barsTested) * barsPerYear : 0;
  const sharpe = sigma > 0 && tradesPerYear > 0 ? (mu / sigma) * Math.sqrt(tradesPerYear) : 0;

  const exits: Record<ExitReason, number> = {
    target: 0,
    stop: 0,
    time: 0,
    "end of data": 0,
    liquidated: 0,
  };
  for (const t of trades) exits[t.reason]++;

  const barsHeld = trades.reduce((s, t) => s + t.bars, 0);

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    grossPnl: trades.reduce((s, t) => s + t.grossPnl, 0),
    fees: trades.reduce((s, t) => s + t.fees, 0),
    funding: trades.reduce((s, t) => s + t.funding, 0),
    slippage: trades.reduce((s, t) => s + t.slippage, 0),
    netPnl,
    returnOnCapitalPct: (netPnl / p.capital) * 100,
    returnOnMarginPct: avgMargin > 0 ? (netPnl / avgMargin) * 100 : 0,
    avgMargin,
    liquidations: trades.filter((t) => t.liquidated).length,
    avgTrade: trades.length ? netPnl / trades.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: trades.length ? netPnl / trades.length : 0,
    maxDrawdown: maxDd,
    maxDrawdownPct: avgMargin > 0 ? (maxDd / avgMargin) * 100 : 0,
    sharpe,
    avgBarsHeld: trades.length ? barsHeld / trades.length : 0,
    avgDaysHeld: trades.length ? (barsHeld / trades.length) * (barSeconds / 86_400) : 0,
    exposurePct: barsTested > 0 ? (barsHeld / barsTested) * 100 : 0,
    bestTrade: trades.length ? Math.max(...trades.map((t) => t.netPnl)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map((t) => t.netPnl)) : 0,
    exits,
  };
}

function empty(p: BacktestParams, t: number[], notes: string[]): BacktestResult {
  return {
    params: p,
    bars: t.length,
    barsTested: 0,
    from: t[0] ?? 0,
    to: t[t.length - 1] ?? 0,
    trades: [],
    equity: [],
    summary: summarise([], [], p, 0, 86_400),
    notes,
  };
}

/**
 * A sensible starting point for a given pair: hold no longer than four
 * half-lives, since past that the spread has shown it is not coming back.
 */
export function suggestMaxBars(spread: number[]): number {
  const { halfLife } = meanReversion(spread);
  if (halfLife === null || !isFinite(halfLife)) return 0;
  return Math.max(4, Math.round(halfLife * 4));
}
