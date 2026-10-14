import { cached, fetchJson } from "../cache";
import type { Candle, CandleProvider, VenueListing } from "../types";

const INFO = "https://api.hyperliquid.xyz/info";

async function info<T>(body: unknown): Promise<T> {
  return fetchJson<T>(INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 12_000,
  });
}

interface HlCandle {
  t: number;
  T: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

async function candles(coin: string, interval: string, bars: number, barSeconds: number): Promise<Candle[]> {
  const end = Date.now();
  const start = end - bars * barSeconds * 1000;
  const raw = await info<HlCandle[]>({
    type: "candleSnapshot",
    req: { coin, interval, startTime: start, endTime: end },
  });
  return raw
    .map((c) => ({
      t: Math.floor(c.t / 1000),
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }))
    .filter((c) => isFinite(c.c) && c.c > 0);
}

export const hyperliquid: CandleProvider = {
  id: "hyperliquid",
  label: "Hyperliquid",
  priority: 30,
  supports: (inst, tf) => Boolean(inst.hl && tf.hl),
  probe: async () => {
    try {
      const c = await candles("BTC", "1h", 5, 3600);
      return c.length > 0 ? { ok: true, note: "crypto perps" } : { ok: false, note: "no candles" };
    } catch (e) {
      return { ok: false, note: e instanceof Error ? e.message : String(e) };
    }
  },
  fetchCandles: async (inst, tf) => {
    const h = tf.hl!;
    return cached(`hl:${inst.hl}:${h.interval}:${h.bars}`, 60_000, () =>
      candles(inst.hl!, h.interval, h.bars, tf.seconds),
    );
  },
};

/* ── venue side: funding + mark price, which is what makes it a perp venue ── */

interface AssetCtx {
  funding: string;
  openInterest: string;
  markPx: string;
  oraclePx: string;
}
type MetaAndCtxs = [{ universe: { name: string; maxLeverage: number; isDelisted?: boolean }[] }, AssetCtx[]];

export async function hlListings(): Promise<Map<string, VenueListing>> {
  return cached("hl:listings", 60_000, async () => {
    const [meta, ctxs] = await info<MetaAndCtxs>({ type: "metaAndAssetCtxs" });
    const out = new Map<string, VenueListing>();
    meta.universe.forEach((u, i) => {
      if (u.isDelisted) return;
      const ctx = ctxs[i];
      if (!ctx) return;
      const fundingHourly = Number(ctx.funding);
      out.set(u.name, {
        venue: "hyperliquid",
        symbol: u.name,
        // Taker 0.045% per side on HL, round trip ≈ 9 bps.
        costBps: 9,
        carryBpsPerHour: isFinite(fundingHourly) ? fundingHourly * 10_000 : undefined,
        maxLeverage: u.maxLeverage,
        marketOpen: true,
      });
    });
    return out;
  });
}
