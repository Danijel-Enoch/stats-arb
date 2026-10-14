import { cached, fetchJson } from "../cache";
import type { Candle, CandleProvider } from "../types";

interface FrResponse {
  rates: Record<string, Record<string, number>>;
}

/**
 * ECB reference rates via frankfurter.dev. Daily only and FX only, but it needs
 * no key and almost never goes down — the right last-resort leg for FX.
 */
async function timeseries(base: string, quote: string, days: number): Promise<Candle[]> {
  const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const url = `https://api.frankfurter.dev/v1/${from}..?base=${base}&symbols=${quote}`;
  const j = await fetchJson<FrResponse>(url, { timeoutMs: 12_000 });
  const out: Candle[] = [];
  for (const [date, rates] of Object.entries(j.rates ?? {})) {
    const c = rates[quote];
    if (!isFinite(c) || c <= 0) continue;
    // ECB publishes one fixing per day; bucket it at 00:00 UTC to line up with
    // Yahoo's daily bars for FX.
    out.push({ t: Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000), o: c, h: c, l: c, c });
  }
  return out.sort((a, b) => a.t - b.t);
}

export const frankfurter: CandleProvider = {
  id: "frankfurter",
  label: "ECB / Frankfurter",
  priority: 40,
  supports: (inst, tf) => Boolean(inst.ecb && tf.daily),
  probe: async () => {
    try {
      const c = await timeseries("EUR", "USD", 10);
      return c.length > 0 ? { ok: true, note: "daily FX only" } : { ok: false, note: "no rates" };
    } catch (e) {
      return { ok: false, note: e instanceof Error ? e.message : String(e) };
    }
  },
  fetchCandles: async (inst, tf) => {
    const [base, quote] = inst.ecb!;
    const days = tf.id === "1w" ? 1825 : 420;
    const daily = await cached(`fr:${base}${quote}:${days}`, 300_000, () => timeseries(base, quote, days));
    if (tf.id !== "1w") return daily;
    // weekly: take the last print of each ISO week
    const byWeek = new Map<string, Candle>();
    for (const c of daily) {
      const d = new Date(c.t * 1000);
      const wk = `${d.getUTCFullYear()}-${Math.floor(d.getTime() / 6048e5)}`;
      byWeek.set(wk, c);
    }
    return [...byWeek.values()].sort((a, b) => a.t - b.t);
  },
};
