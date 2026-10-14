import { cached, fetchJson } from "../cache";
import { gate } from "../limiter";
import type { Candle, CandleProvider } from "../types";

/**
 * Alpha Vantage, when a key is present, is the one free source that covers all
 * three of this app's focus areas from one place: FX dailies, US equity
 * intraday + daily, and — unusually — spot commodity series (WTI, Brent,
 * natgas, copper, wheat, corn, cotton, sugar, coffee).
 *
 * Instrument field format: "fx:EUR/USD" | "eq:AAPL" | "cm:WTI".
 */
const BASE = "https://www.alphavantage.co/query";

function key(): string | undefined {
  return process.env.ALPHAVANTAGE_API_KEY?.trim() || undefined;
}

type Row = Record<string, Record<string, string>>;

async function av<T>(params: Record<string, string>): Promise<T> {
  const k = key();
  if (!k) throw new Error("ALPHAVANTAGE_API_KEY not set");
  const qs = new URLSearchParams({ ...params, apikey: k }).toString();
  // The free tier is 5 requests/minute — space them hard.
  return gate("alphavantage", 1200, async () => {
    const j = await fetchJson<T & { Note?: string; Information?: string; "Error Message"?: string }>(
      `${BASE}?${qs}`,
      { timeoutMs: 20_000 },
    );
    if (j.Note) throw new Error("rate limited");
    if (j.Information) throw new Error(j.Information.slice(0, 80));
    if (j["Error Message"]) throw new Error(j["Error Message"].slice(0, 80));
    return j as T;
  });
}

function fromRows(rows: Row): Candle[] {
  const out: Candle[] = [];
  for (const [date, v] of Object.entries(rows)) {
    const c = Number(v["4. close"] ?? v["close"]);
    if (!isFinite(c) || c <= 0) continue;
    const iso = date.includes(" ") ? date.replace(" ", "T") + "Z" : `${date}T00:00:00Z`;
    out.push({
      t: Math.floor(new Date(iso).getTime() / 1000),
      o: Number(v["1. open"]) || c,
      h: Number(v["2. high"]) || c,
      l: Number(v["3. low"]) || c,
      c,
      v: Number(v["5. volume"] ?? v["6. volume"]) || 0,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

function seriesKey(j: Record<string, unknown>): Row | null {
  const k = Object.keys(j).find((x) => /Time Series|FX \(/i.test(x));
  return k ? (j[k] as Row) : null;
}

async function fetchAv(spec: string, tfId: string): Promise<Candle[]> {
  const [kind, sym] = spec.split(":");
  const intraday = tfId === "15m" || tfId === "1h" || tfId === "4h";

  if (kind === "cm") {
    // Commodity series are value-only and daily at best.
    const j = await av<{ data?: { date: string; value: string }[] }>({
      function: sym,
      interval: "daily",
    });
    return (j.data ?? [])
      .map((r) => ({ t: Math.floor(new Date(`${r.date}T00:00:00Z`).getTime() / 1000), o: 0, h: 0, l: 0, c: Number(r.value) }))
      .filter((c) => isFinite(c.c) && c.c > 0)
      .map((c) => ({ ...c, o: c.c, h: c.c, l: c.c }))
      .sort((a, b) => a.t - b.t);
  }

  if (kind === "fx") {
    const [from, to] = sym.split("/");
    if (intraday) {
      const j = await av<Record<string, unknown>>({
        function: "FX_INTRADAY",
        from_symbol: from,
        to_symbol: to,
        interval: tfId === "15m" ? "15min" : "60min",
        outputsize: "full",
      });
      const rows = seriesKey(j);
      if (!rows) throw new Error("no FX intraday series");
      return fromRows(rows);
    }
    const j = await av<Record<string, unknown>>({
      function: "FX_DAILY",
      from_symbol: from,
      to_symbol: to,
      outputsize: "full",
    });
    const rows = seriesKey(j);
    if (!rows) throw new Error("no FX daily series");
    return fromRows(rows);
  }

  // equities
  if (intraday) {
    const j = await av<Record<string, unknown>>({
      function: "TIME_SERIES_INTRADAY",
      symbol: sym,
      interval: tfId === "15m" ? "15min" : "60min",
      outputsize: "full",
    });
    const rows = seriesKey(j);
    if (!rows) throw new Error("no intraday series");
    return fromRows(rows);
  }
  const j = await av<Record<string, unknown>>({
    function: tfId === "1w" ? "TIME_SERIES_WEEKLY" : "TIME_SERIES_DAILY",
    symbol: sym,
    outputsize: "full",
  });
  const rows = seriesKey(j);
  if (!rows) throw new Error("no daily series");
  return fromRows(rows);
}

/** 4h bars are folded from the 60min series. */
function fold4(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += 4) {
    const g = candles.slice(i, i + 4);
    if (!g.length) continue;
    out.push({
      t: g[0].t,
      o: g[0].o,
      h: Math.max(...g.map((x) => x.h)),
      l: Math.min(...g.map((x) => x.l)),
      c: g[g.length - 1].c,
      v: g.reduce((s, x) => s + (x.v ?? 0), 0),
    });
  }
  return out;
}

export const alphavantage: CandleProvider = {
  id: "alphavantage",
  label: "Alpha Vantage",
  priority: 35,
  supports: (inst, tf) => {
    if (!inst.av || !key()) return false;
    // commodity series are daily-only
    if (inst.av.startsWith("cm:")) return Boolean(tf.daily);
    return true;
  },
  probe: async () => {
    if (!key()) return { ok: false, note: "ALPHAVANTAGE_API_KEY not set", needsKey: true };
    try {
      const c = await fetchAv("fx:EUR/USD", "1d");
      return c.length > 0 ? { ok: true, note: "FX + equities + commodities" } : { ok: false, note: "empty series" };
    } catch (e) {
      return { ok: false, note: e instanceof Error ? e.message : String(e) };
    }
  },
  fetchCandles: async (inst, tf) => {
    const raw = await cached(`av:${inst.av}:${tf.id}`, 600_000, () => fetchAv(inst.av!, tf.id));
    return tf.id === "4h" ? fold4(raw) : raw;
  },
};
