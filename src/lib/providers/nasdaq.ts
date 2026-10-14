import { cached, fetchJson } from "../cache";
import { gate, retrying } from "../limiter";
import type { Candle, CandleProvider } from "../types";

interface NasdaqHistorical {
  data: {
    tradesTable?: {
      rows: { date: string; close: string; open: string; high: string; low: string; volume: string }[];
    };
  } | null;
  status?: { bCodeMessage?: { errorMessage: string }[] };
}

const money = (s: string | undefined): number =>
  s ? Number(s.replace(/[$,]/g, "")) : NaN;

/** Nasdaq's own quote service: keyless daily OHLC for US stocks and ETFs. */
async function historical(symbol: string, assetclass: string, days: number): Promise<Candle[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical` +
    `?assetclass=${assetclass}&fromdate=${fmt(from)}&todate=${fmt(to)}&limit=${Math.min(5000, days + 10)}`;

  return retrying(2, () =>
    gate("nasdaq", 250, async () => {
      const j = await fetchJson<NasdaqHistorical>(url, { timeoutMs: 15_000 });
      const rows = j.data?.tradesTable?.rows;
      if (!rows?.length) {
        throw new Error(j.status?.bCodeMessage?.[0]?.errorMessage ?? "no rows");
      }
      const out: Candle[] = [];
      for (const r of rows) {
        const c = money(r.close);
        if (!isFinite(c) || c <= 0) continue;
        const [m, d, y] = r.date.split("/");
        const t = Math.floor(Date.UTC(Number(y), Number(m) - 1, Number(d)) / 1000);
        out.push({
          t,
          o: orElse(money(r.open), c),
          h: orElse(money(r.high), c),
          l: orElse(money(r.low), c),
          c,
          v: orElse(money(r.volume), 0),
        });
      }
      return out.sort((a, b) => a.t - b.t);
    }),
  );
}

function orElse(v: number, fallback: number): number {
  return isFinite(v) ? v : fallback;
}

/**
 * Nasdaq wants to be told whether a symbol is a stock or an ETF, and rejects
 * the wrong guess outright. Rather than maintain a list, try both — the answer
 * is cached, so the extra call happens once per symbol.
 */
async function historicalEither(symbol: string, days: number): Promise<Candle[]> {
  try {
    return await historical(symbol, "stocks", days);
  } catch (e) {
    if (!/not exist|Bad or No parameter|no rows/i.test(e instanceof Error ? e.message : String(e))) throw e;
    return historical(symbol, "etf", days);
  }
}

interface NasdaqChart {
  data: { chart?: { x: number; y: number }[] } | null;
}

/**
 * Nasdaq also serves minute ticks, but only for the *current* session. That is
 * thin — one day of bars — so it is a last-resort intraday fallback, used only
 * when Yahoo is throttled and no API key is configured. The bar count is shown
 * on every chart, so a short window is never hidden.
 */
async function intraday(symbol: string, assetclass: string, bucketSeconds: number): Promise<Candle[]> {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/chart?assetclass=${assetclass}`;
  const ticks = await gate("nasdaq", 250, async () => {
    const j = await fetchJson<NasdaqChart>(url, { timeoutMs: 15_000 });
    const c = j.data?.chart;
    if (!c?.length) throw new Error("no intraday ticks");
    return c;
  });

  const buckets = new Map<number, Candle>();
  for (const tick of ticks) {
    const price = Number(tick.y);
    if (!isFinite(price) || price <= 0) continue;
    const t = Math.floor(tick.x / 1000 / bucketSeconds) * bucketSeconds;
    const prev = buckets.get(t);
    if (!prev) buckets.set(t, { t, o: price, h: price, l: price, c: price });
    else {
      prev.h = Math.max(prev.h, price);
      prev.l = Math.min(prev.l, price);
      prev.c = price;
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

async function intradayEither(symbol: string, bucketSeconds: number): Promise<Candle[]> {
  try {
    return await intraday(symbol, "stocks", bucketSeconds);
  } catch (e) {
    if (!/not exist|Bad or No parameter|no intraday/i.test(e instanceof Error ? e.message : String(e))) throw e;
    return intraday(symbol, "etf", bucketSeconds);
  }
}

export const nasdaq: CandleProvider = {
  id: "nasdaq",
  label: "Nasdaq",
  priority: 25,
  // US listings only. Daily at any depth; intraday for the current session
  // only, which is why 1h and 1w are excluded — one session is 6.5 hours, far
  // too few bars at those sizes to say anything.
  supports: (inst, tf) =>
    Boolean((tf.daily || tf.id === "15m") && (inst.nasdaq ?? usListed(inst.yahoo))),
  probe: async () => {
    try {
      const c = await historical("AAPL", "stocks", 20);
      return c.length > 0 ? { ok: true, note: "daily, US listings" } : { ok: false, note: "no rows" };
    } catch (e) {
      return { ok: false, note: e instanceof Error ? e.message : String(e) };
    }
  },
  fetchCandles: async (inst, tf) => {
    const sym = inst.nasdaq ?? inst.yahoo!;
    if (tf.id === "15m") {
      return cached(`nq-intra:${sym}:${tf.seconds}`, 60_000, () => intradayEither(sym, tf.seconds));
    }
    const days = tf.id === "1w" ? 1825 : 400;
    const daily = await cached(`nq:${sym}:${days}`, 300_000, () => historicalEither(sym, days));
    if (tf.id !== "1w") return daily;
    const byWeek = new Map<number, Candle>();
    for (const c of daily) byWeek.set(Math.floor(c.t / 604800), c);
    return [...byWeek.values()].sort((a, b) => a.t - b.t);
  },
};

/** A plain alphanumeric Yahoo ticker is a US listing; "GC=F" or "^GSPC" is not. */
function usListed(yahooSymbol?: string): string | undefined {
  if (!yahooSymbol) return undefined;
  return /^[A-Z.]{1,6}$/.test(yahooSymbol) ? yahooSymbol : undefined;
}
