import { cached, fetchJson } from "../cache";
import { gate, retrying, trip, tripped, untrip } from "../limiter";
import type { Candle, CandleProvider, Instrument, Timeframe } from "../types";

interface YahooChart {
  chart: {
    error: { description?: string } | null;
    result:
      | {
          meta: { symbol: string; regularMarketPrice?: number };
          timestamp?: number[];
          indicators: {
            quote: {
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }[];
          };
        }[]
      | null;
  };
}

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

const BREAKER = "yahoo:429";

async function chart(symbol: string, interval: string, range: string): Promise<Candle[]> {
  const open = tripped(BREAKER);
  if (open) throw new Error(open);
  return retrying(
    3,
    (attempt) =>
      // 140ms between calls keeps a 40-symbol scan under Yahoo's burst limit.
      gate("yahoo", 140, async () => {
        const host = HOSTS[attempt % HOSTS.length];
        const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
        const j = await fetchJson<YahooChart>(url, { timeoutMs: 12_000 });
        const r = j.chart.result?.[0];
        if (!r?.timestamp) throw new Error(j.chart.error?.description ?? "empty chart");
        const q = r.indicators.quote[0] ?? {};
        const out: Candle[] = [];
        for (let i = 0; i < r.timestamp.length; i++) {
          const c = q.close?.[i];
          if (c === null || c === undefined || !isFinite(c)) continue;
          out.push({
            t: r.timestamp[i],
            o: num(q.open?.[i], c),
            h: num(q.high?.[i], c),
            l: num(q.low?.[i], c),
            c,
            v: num(q.volume?.[i], 0),
          });
        }
        untrip(BREAKER);
        return out;
      }).catch((e: unknown) => {
        // A 429 means the whole IP is throttled, not just this symbol — stand
        // down for 90s and let the rest of the chain carry the scan.
        if (/\b429\b/.test(e instanceof Error ? e.message : String(e))) {
          trip(BREAKER, 90_000, "Yahoo rate-limited this IP (429) — backing off 90s");
        }
        throw e;
      }),
    // a 429 or 5xx is worth another host; a bad symbol is not
    (e) => /429|5\d\d|timeout|aborted|fetch failed/i.test(e instanceof Error ? e.message : String(e)),
  );
}

function num(v: number | null | undefined, fallback: number): number {
  return v === null || v === undefined || !isFinite(v) ? fallback : v;
}

/** Fold N consecutive bars into one — how 4h bars are built from 1h data. */
export function fold(candles: Candle[], n: number): Candle[] {
  if (n <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += n) {
    const grp = candles.slice(i, i + n);
    if (!grp.length) continue;
    out.push({
      t: grp[0].t,
      o: grp[0].o,
      h: Math.max(...grp.map((g) => g.h)),
      l: Math.min(...grp.map((g) => g.l)),
      c: grp[grp.length - 1].c,
      v: grp.reduce((s, g) => s + (g.v ?? 0), 0),
    });
  }
  return out;
}

export const yahoo: CandleProvider = {
  id: "yahoo",
  label: "Yahoo Finance",
  priority: 10,
  supports: (inst: Instrument, tf: Timeframe) => Boolean(inst.yahoo && tf.yahoo),
  probe: async () => {
    try {
      const c = await chart("EURUSD=X", "1d", "5d");
      return c.length > 0 ? { ok: true } : { ok: false, note: "no bars returned" };
    } catch (e) {
      return { ok: false, note: msg(e) };
    }
  },
  fetchCandles: async (inst, tf) => {
    const y = tf.yahoo!;
    const raw = await cached(`yahoo:${inst.yahoo}:${y.interval}:${y.range}`, 60_000, () =>
      chart(inst.yahoo!, y.interval, y.range),
    );
    return tf.fold ? fold(raw, tf.fold) : raw;
  },
};

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
