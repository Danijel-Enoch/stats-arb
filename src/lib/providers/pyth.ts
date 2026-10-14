import { cached, fetchJson } from "../cache";

/**
 * Pyth's feed *metadata* is open (and is the broadest RWA symbol list going:
 * ~1,260 equities, 39 FX pairs, 36 commodity contracts, 11 metals). The price
 * read endpoints now want an API key, so live prices here are gated on
 * PYTH_API_KEY / HERMES_API_KEY being set.
 */
const HERMES = "https://hermes.pyth.network";

interface FeedMeta {
  id: string;
  market_hours?: { is_open: boolean; next_open?: number; next_close?: number };
  attributes: {
    symbol: string;
    asset_type: string;
    description?: string;
    display_symbol?: string;
    quote_currency?: string;
  };
}

function apiKey(): string | undefined {
  return process.env.PYTH_API_KEY?.trim() || process.env.HERMES_API_KEY?.trim() || undefined;
}

function authHeaders(): Record<string, string> {
  const k = apiKey();
  return k ? { Authorization: `Bearer ${k}` } : {};
}

export async function pythFeeds(): Promise<Map<string, FeedMeta>> {
  return cached("pyth:feeds", 900_000, async () => {
    const types = ["fx", "metal", "commodities", "equity", "crypto"];
    const out = new Map<string, FeedMeta>();
    const results = await Promise.allSettled(
      types.map((t) => fetchJson<FeedMeta[]>(`${HERMES}/v2/price_feeds?asset_type=${t}`, { timeoutMs: 15_000 })),
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const f of r.value) out.set(f.attributes.symbol, f);
    }
    return out;
  });
}

export interface PythPrice {
  symbol: string;
  price: number;
  confBps: number;
  publishTime: number;
}

interface ParsedUpdate {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
}

/** Live Pyth prices — only when a key is configured. */
export async function pythPrices(symbols: string[]): Promise<Map<string, PythPrice>> {
  const out = new Map<string, PythPrice>();
  if (!apiKey() || !symbols.length) return out;
  const feeds = await pythFeeds();
  const ids: string[] = [];
  const idToSymbol = new Map<string, string>();
  for (const s of symbols) {
    const f = feeds.get(s);
    if (!f) continue;
    ids.push(f.id);
    idToSymbol.set(f.id, s);
  }
  if (!ids.length) return out;
  const qs = ids.map((i) => `ids[]=${i}`).join("&");
  const j = await fetchJson<{ parsed: ParsedUpdate[] }>(`${HERMES}/v2/updates/price/latest?${qs}`, {
    headers: authHeaders(),
    timeoutMs: 15_000,
  });
  for (const u of j.parsed ?? []) {
    const sym = idToSymbol.get(u.id);
    if (!sym) continue;
    const price = Number(u.price.price) * 10 ** u.price.expo;
    const conf = Number(u.price.conf) * 10 ** u.price.expo;
    out.set(sym, {
      symbol: sym,
      price,
      confBps: price > 0 ? (conf / price) * 10_000 : 0,
      publishTime: u.price.publish_time,
    });
  }
  return out;
}

/** Market-hours flags straight from the feed metadata. */
export async function pythMarketHours(symbols: string[]) {
  const feeds = await pythFeeds();
  const out = new Map<string, { isOpen: boolean; nextOpen?: number; nextClose?: number }>();
  for (const s of symbols) {
    const f = feeds.get(s);
    if (f?.market_hours) {
      out.set(s, {
        isOpen: f.market_hours.is_open,
        nextOpen: f.market_hours.next_open,
        nextClose: f.market_hours.next_close,
      });
    }
  }
  return out;
}

export async function pythProbe() {
  try {
    const feeds = await pythFeeds();
    if (!feeds.size) return { ok: false, note: "no feed metadata" };
    const keyed = Boolean(apiKey());
    return {
      ok: true,
      note: keyed ? `${feeds.size} feeds, live prices on` : `${feeds.size} feeds · metadata only (set PYTH_API_KEY for prices)`,
      needsKey: !keyed,
    };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : String(e) };
  }
}
