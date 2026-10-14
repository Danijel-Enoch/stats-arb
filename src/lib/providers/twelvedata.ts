import { cached, fetchJson } from "../cache";
import type { Candle, CandleProvider } from "../types";

interface TdResponse {
  status?: string;
  message?: string;
  values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[];
}

function key(): string {
  return process.env.TWELVEDATA_API_KEY?.trim() || "demo";
}

async function series(symbol: string, interval: string, outputsize: number): Promise<Candle[]> {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&order=ASC&apikey=${key()}`;
  const j = await fetchJson<TdResponse>(url, { timeoutMs: 12_000 });
  if (j.status === "error" || !j.values) throw new Error(j.message ?? "twelvedata error");
  return j.values
    .map((v) => ({
      t: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      o: Number(v.open),
      h: Number(v.high),
      l: Number(v.low),
      c: Number(v.close),
      v: v.volume ? Number(v.volume) : 0,
    }))
    .filter((c) => isFinite(c.c) && c.c > 0);
}

export const twelvedata: CandleProvider = {
  id: "twelvedata",
  label: "Twelve Data",
  priority: 20,
  supports: (inst, tf) => Boolean(inst.twelve && tf.twelve),
  probe: async () => {
    const hasKey = Boolean(process.env.TWELVEDATA_API_KEY?.trim());
    try {
      const c = await series("EUR/USD", "1day", 5);
      return c.length > 0
        ? { ok: true, note: hasKey ? undefined : "demo key — FX majors only", needsKey: !hasKey }
        : { ok: false, note: "no values", needsKey: !hasKey };
    } catch (e) {
      return { ok: false, note: msg(e), needsKey: !hasKey };
    }
  },
  fetchCandles: async (inst, tf) => {
    const t = tf.twelve!;
    return cached(`td:${inst.twelve}:${t.interval}:${t.outputsize}`, 120_000, () =>
      series(inst.twelve!, t.interval, t.outputsize),
    );
  },
};

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
