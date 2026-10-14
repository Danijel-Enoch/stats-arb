import { cached, fetchJson } from "../cache";
import type { VenueListing } from "../types";

/**
 * gTrade (Gains Network) is the reason this scanner is useful for non-crypto:
 * it lists FX, equities, indices, metals and energy as perps on Arbitrum. The
 * backend publishes the whole trading-variables blob — pairs, spreads, fees,
 * leverage caps and, critically, the per-asset-class market-open flags.
 */
const ENDPOINTS = [
  "https://backend-arbitrum.gains.trade/trading-variables",
  "https://backend-polygon.gains.trade/trading-variables",
  "https://backend-base.gains.trade/trading-variables",
];

interface TradingVariables {
  pairs: { from: string; to: string; groupIndex: string; feeIndex: string; spreadP: string }[];
  groups: { name: string; minLeverage: string; maxLeverage: string }[];
  fees: { totalPositionSizeFeeP: string }[];
  isForexOpen?: boolean;
  isStocksOpen?: boolean;
  isIndicesOpen?: boolean;
  isCommoditiesOpen?: boolean;
  lastRefreshed?: string;
}

/** gTrade stores percentages scaled by 1e10, so value/1e8 is basis points. */
const toBps = (v: string | number) => Number(v) / 1e8;
/** Leverage is scaled by 1e4. */
const toLev = (v: string | number) => Number(v) / 1e4;

async function raw(): Promise<TradingVariables> {
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      return await fetchJson<TradingVariables>(url, { timeoutMs: 20_000 });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("gains unreachable");
}

export interface GainsSnapshot {
  listings: Map<string, VenueListing>;
  sessions: Record<string, boolean>;
  lastRefreshed?: string;
}

/**
 * Groups are numbered and suffixed ("stocks-1", "commodities-2",
 * "forex-exotic"), while the open flags are per asset class — match on the
 * prefix so a new sub-group doesn't silently lose its session state.
 */
function openFor(groupName: string, tv: TradingVariables): boolean | undefined {
  if (groupName.startsWith("forex")) return tv.isForexOpen;
  if (groupName.startsWith("stocks")) return tv.isStocksOpen;
  if (groupName.startsWith("indices")) return tv.isIndicesOpen;
  if (groupName.startsWith("commodities")) return tv.isCommoditiesOpen;
  if (groupName.startsWith("crypto") || groupName === "altcoins") return true;
  return undefined;
}

export async function gainsSnapshot(): Promise<GainsSnapshot> {
  return cached("gains:snapshot", 180_000, async () => {
    const tv = await raw();
    const listings = new Map<string, VenueListing>();
    for (const p of tv.pairs) {
      // "_1" suffixes are duplicate listings on a second collateral pool.
      if (p.from.includes("_")) continue;
      const sym = `${p.from}/${p.to}`;
      const group = tv.groups[Number(p.groupIndex)];
      const fee = tv.fees[Number(p.feeIndex)];
      const spreadBps = toBps(p.spreadP);
      const feeBps = fee ? toBps(fee.totalPositionSizeFeeP) : 6;
      listings.set(sym, {
        venue: "gtrade",
        symbol: sym,
        // spread is paid once on entry; the position-size fee on both legs.
        costBps: spreadBps + feeBps * 2,
        maxLeverage: group ? toLev(group.maxLeverage) : undefined,
        marketOpen: group ? openFor(group.name, tv) : undefined,
        note: group?.name,
      });
    }
    return {
      listings,
      sessions: {
        forex: Boolean(tv.isForexOpen),
        stocks: Boolean(tv.isStocksOpen),
        indices: Boolean(tv.isIndicesOpen),
        commodities: Boolean(tv.isCommoditiesOpen),
        crypto: true,
      },
      lastRefreshed: tv.lastRefreshed,
    };
  });
}

export async function gainsProbe() {
  try {
    const s = await gainsSnapshot();
    return s.listings.size > 0
      ? { ok: true, note: `${s.listings.size} perp pairs` }
      : { ok: false, note: "no pairs" };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : String(e) };
  }
}
