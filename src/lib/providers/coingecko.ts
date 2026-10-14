import { cached, fetchJson } from "../cache";
import type { Candle, CandleProvider } from "../types";

interface GeckoChart {
  prices: [number, number][];
}

async function marketChart(id: string, days: number): Promise<Candle[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const j = await fetchJson<GeckoChart>(url, { timeoutMs: 12_000 });
  return (j.prices ?? [])
    .map(([ms, p]) => ({ t: Math.floor(ms / 1000), o: p, h: p, l: p, c: p }))
    .filter((c) => isFinite(c.c) && c.c > 0);
}

/** Buckets irregular tick data onto a fixed grid. */
function bucket(candles: Candle[], seconds: number): Candle[] {
  const m = new Map<number, Candle>();
  for (const c of candles) {
    const t = Math.floor(c.t / seconds) * seconds;
    const prev = m.get(t);
    if (!prev) m.set(t, { ...c, t });
    else m.set(t, { t, o: prev.o, h: Math.max(prev.h, c.h), l: Math.min(prev.l, c.l), c: c.c });
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

export const coingecko: CandleProvider = {
  id: "coingecko",
  label: "CoinGecko",
  priority: 50,
  supports: (inst) => Boolean(inst.gecko),
  probe: async () => {
    try {
      await fetchJson<{ gecko_says: string }>("https://api.coingecko.com/api/v3/ping", { timeoutMs: 8000 });
      return { ok: true, note: "crypto spot fallback" };
    } catch (e) {
      return { ok: false, note: e instanceof Error ? e.message : String(e) };
    }
  },
  fetchCandles: async (inst, tf) => {
    const days = tf.id === "1w" ? 1800 : tf.id === "1d" ? 365 : tf.id === "4h" ? 90 : 30;
    const raw = await cached(`cg:${inst.gecko}:${days}`, 300_000, () => marketChart(inst.gecko!, days));
    return bucket(raw, tf.seconds);
  },
};
