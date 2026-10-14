import type { Instrument } from "./types";

/**
 * Curated universe, deliberately weighted to FX / commodities / indices /
 * equities. Crypto is present only as a reference block (BTC/ETH/SOL plus the
 * equity proxies that trade against them), because the crypto perp venues are
 * the one place where everything is already arbitraged to death.
 */
export const UNIVERSE: Instrument[] = [
  // ─── FX majors ────────────────────────────────────────────────────────────
  { id: "EURUSD", name: "EUR/USD", cls: "fx", yahoo: "EURUSD=X", twelve: "EUR/USD", ecb: ["EUR", "USD"], gains: "EUR/USD", pyth: "FX.EUR/USD", av: "fx:EUR/USD" },
  { id: "GBPUSD", name: "GBP/USD", cls: "fx", yahoo: "GBPUSD=X", twelve: "GBP/USD", ecb: ["GBP", "USD"], gains: "GBP/USD", pyth: "FX.GBP/USD", av: "fx:GBP/USD" },
  { id: "USDJPY", name: "USD/JPY", cls: "fx", yahoo: "USDJPY=X", twelve: "USD/JPY", ecb: ["USD", "JPY"], gains: "USD/JPY", pyth: "FX.USD/JPY", av: "fx:USD/JPY" },
  { id: "USDCHF", name: "USD/CHF", cls: "fx", yahoo: "USDCHF=X", twelve: "USD/CHF", ecb: ["USD", "CHF"], gains: "USD/CHF", pyth: "FX.USD/CHF", av: "fx:USD/CHF" },
  { id: "AUDUSD", name: "AUD/USD", cls: "fx", yahoo: "AUDUSD=X", twelve: "AUD/USD", ecb: ["AUD", "USD"], gains: "AUD/USD", pyth: "FX.AUD/USD", av: "fx:AUD/USD" },
  { id: "NZDUSD", name: "NZD/USD", cls: "fx", yahoo: "NZDUSD=X", twelve: "NZD/USD", ecb: ["NZD", "USD"], gains: "NZD/USD", pyth: "FX.NZD/USD", av: "fx:NZD/USD" },
  { id: "USDCAD", name: "USD/CAD", cls: "fx", yahoo: "USDCAD=X", twelve: "USD/CAD", ecb: ["USD", "CAD"], gains: "USD/CAD", pyth: "FX.USD/CAD", av: "fx:USD/CAD" },
  { id: "DXY", name: "Dollar Index", cls: "fx", yahoo: "DX-Y.NYB", proxy: "UUP", proxyNote: "UUP — Invesco DB US Dollar Index Bullish Fund" },
  // ─── FX crosses & EM ──────────────────────────────────────────────────────
  { id: "EURGBP", name: "EUR/GBP", cls: "fx", yahoo: "EURGBP=X", twelve: "EUR/GBP", ecb: ["EUR", "GBP"], gains: "EUR/GBP", pyth: "FX.EUR/GBP", av: "fx:EUR/GBP" },
  { id: "EURJPY", name: "EUR/JPY", cls: "fx", yahoo: "EURJPY=X", twelve: "EUR/JPY", ecb: ["EUR", "JPY"], gains: "EUR/JPY", pyth: "FX.EUR/JPY", av: "fx:EUR/JPY" },
  { id: "AUDJPY", name: "AUD/JPY", cls: "fx", yahoo: "AUDJPY=X", twelve: "AUD/JPY", ecb: ["AUD", "JPY"], gains: "AUD/JPY", av: "fx:AUD/JPY" },
  { id: "GBPJPY", name: "GBP/JPY", cls: "fx", yahoo: "GBPJPY=X", twelve: "GBP/JPY", ecb: ["GBP", "JPY"], gains: "GBP/JPY", av: "fx:GBP/JPY" },
  { id: "AUDNZD", name: "AUD/NZD", cls: "fx", yahoo: "AUDNZD=X", twelve: "AUD/NZD", ecb: ["AUD", "NZD"], gains: "AUD/NZD", pyth: "FX.AUD/NZD", av: "fx:AUD/NZD" },
  { id: "USDNOK", name: "USD/NOK", cls: "fx", yahoo: "USDNOK=X", twelve: "USD/NOK", ecb: ["USD", "NOK"], av: "fx:USD/NOK" },
  { id: "USDSEK", name: "USD/SEK", cls: "fx", yahoo: "USDSEK=X", twelve: "USD/SEK", ecb: ["USD", "SEK"], av: "fx:USD/SEK" },
  { id: "USDMXN", name: "USD/MXN", cls: "fx", yahoo: "USDMXN=X", twelve: "USD/MXN", ecb: ["USD", "MXN"], gains: "USD/MXN", av: "fx:USD/MXN" },
  { id: "USDZAR", name: "USD/ZAR", cls: "fx", yahoo: "USDZAR=X", twelve: "USD/ZAR", ecb: ["USD", "ZAR"], gains: "USD/ZAR", av: "fx:USD/ZAR" },
  { id: "USDCNH", name: "USD/CNH", cls: "fx", yahoo: "USDCNH=X", twelve: "USD/CNH", gains: "USD/CNH", av: "fx:USD/CNH" },
  { id: "USDBRL", name: "USD/BRL", cls: "fx", yahoo: "USDBRL=X", twelve: "USD/BRL", ecb: ["USD", "BRL"], gains: "USD/BRL", av: "fx:USD/BRL" },
  { id: "USDINR", name: "USD/INR", cls: "fx", yahoo: "USDINR=X", twelve: "USD/INR", ecb: ["USD", "INR"], gains: "USD/INR", av: "fx:USD/INR" },

  // ─── Metals ───────────────────────────────────────────────────────────────
  { id: "XAUUSD", name: "Gold", cls: "metals", yahoo: "GC=F", twelve: "XAU/USD", gains: "XAU/USD", pyth: "Metal.XAU/USD", av: "fx:XAU/USD", proxy: "GLD", proxyNote: "GLD — SPDR Gold Shares" },
  { id: "XAGUSD", name: "Silver", cls: "metals", yahoo: "SI=F", twelve: "XAG/USD", gains: "XAG/USD", pyth: "Metal.XAG/USD", av: "fx:XAG/USD", proxy: "SLV", proxyNote: "SLV — iShares Silver Trust" },
  { id: "COPPER", name: "Copper", cls: "metals", yahoo: "HG=F", gains: "HG/USD", pyth: "Commodities.Index.CU/USD", av: "cm:COPPER", proxy: "CPER", proxyNote: "CPER — US Copper Index Fund" },
  { id: "XPTUSD", name: "Platinum", cls: "metals", yahoo: "PL=F", gains: "XPT/USD", pyth: "Metal.XPT/USD", proxy: "PPLT", proxyNote: "PPLT — abrdn Platinum Trust" },
  { id: "XPDUSD", name: "Palladium", cls: "metals", yahoo: "PA=F", gains: "XPD/USD", pyth: "Metal.XPD/USD", proxy: "PALL", proxyNote: "PALL — abrdn Palladium Trust" },

  // ─── Energy ───────────────────────────────────────────────────────────────
  { id: "WTI", name: "WTI Crude", cls: "energy", yahoo: "CL=F", gains: "WTI/USD", pyth: "Commodities.Index.WTI1M/USD", av: "cm:WTI", proxy: "USO", proxyNote: "USO — US Oil Fund (front-month, carries roll cost)" },
  { id: "BRENT", name: "Brent Crude", cls: "energy", yahoo: "BZ=F", gains: "BRENT/USD", pyth: "Commodities.Index.BRENT/USD", av: "cm:BRENT", proxy: "BNO", proxyNote: "BNO — US Brent Oil Fund" },
  { id: "NATGAS", name: "Natural Gas", cls: "energy", yahoo: "NG=F", gains: "NATGAS/USD", pyth: "Commodities.Index.NATGAS/USD", av: "cm:NATURAL_GAS", proxy: "UNG", proxyNote: "UNG — US Natural Gas Fund" },
  { id: "GASOLINE", name: "RBOB Gasoline", cls: "energy", yahoo: "RB=F", proxy: "UGA", proxyNote: "UGA — US Gasoline Fund" },
  { id: "HEATOIL", name: "Heating Oil", cls: "energy", yahoo: "HO=F" },
  { id: "TTFGAS", name: "Dutch TTF Gas", cls: "energy", pyth: "Commodities.Index.TGAS1M/USD", proxy: "FCG", proxyNote: "FCG — natural-gas equity proxy; weak tracker for TTF" },

  // ─── Ags ──────────────────────────────────────────────────────────────────
  { id: "CORN", name: "Corn", cls: "ags", yahoo: "ZC=F", av: "cm:CORN", proxy: "CORN", proxyNote: "CORN — Teucrium Corn Fund" },
  { id: "WHEAT", name: "Wheat", cls: "ags", yahoo: "ZW=F", av: "cm:WHEAT", proxy: "WEAT", proxyNote: "WEAT — Teucrium Wheat Fund" },
  { id: "SOYBEAN", name: "Soybeans", cls: "ags", yahoo: "ZS=F", proxy: "SOYB", proxyNote: "SOYB — Teucrium Soybean Fund" },
  { id: "COFFEE", name: "Coffee", cls: "ags", yahoo: "KC=F", av: "cm:COFFEE", proxy: "JO", proxyNote: "JO — Barclays Coffee ETN" },
  { id: "SUGAR", name: "Sugar", cls: "ags", yahoo: "SB=F", av: "cm:SUGAR", proxy: "CANE", proxyNote: "CANE — Teucrium Sugar Fund" },
  { id: "COCOA", name: "Cocoa", cls: "ags", yahoo: "CC=F", proxy: "NIB", proxyNote: "NIB — iPath Cocoa ETN" },
  { id: "COTTON", name: "Cotton", cls: "ags", yahoo: "CT=F", av: "cm:COTTON", proxy: "BAL", proxyNote: "BAL — iPath Cotton ETN" },
  { id: "LIVECATTLE", name: "Live Cattle", cls: "ags", yahoo: "LE=F", proxy: "COW", proxyNote: "COW — iPath Livestock ETN" },

  // ─── Indices ──────────────────────────────────────────────────────────────
  { id: "SPX500", name: "S&P 500", cls: "indices", yahoo: "^GSPC", gains: "SPX500/USD", proxy: "SPY", proxyNote: "SPY — S&P 500 ETF" },
  { id: "NAS100", name: "Nasdaq 100", cls: "indices", yahoo: "^NDX", gains: "NAS100/USD", proxy: "QQQ", proxyNote: "QQQ — Nasdaq 100 ETF" },
  { id: "USA30", name: "Dow 30", cls: "indices", yahoo: "^DJI", gains: "USA30/USD", proxy: "DIA", proxyNote: "DIA — Dow 30 ETF" },
  { id: "RUT2000", name: "Russell 2000", cls: "indices", yahoo: "^RUT", proxy: "IWM", proxyNote: "IWM — Russell 2000 ETF" },
  { id: "DAX", name: "DAX 40", cls: "indices", yahoo: "^GDAXI", proxy: "EWG", proxyNote: "EWG — MSCI Germany ETF (USD, unhedged)" },
  { id: "FTSE100", name: "FTSE 100", cls: "indices", yahoo: "^FTSE", proxy: "EWU", proxyNote: "EWU — MSCI UK ETF (USD, unhedged)" },
  { id: "NIKKEI", name: "Nikkei 225", cls: "indices", yahoo: "^N225", proxy: "EWJ", proxyNote: "EWJ — MSCI Japan ETF (USD, unhedged)" },
  { id: "VIX", name: "VIX", cls: "indices", yahoo: "^VIX", proxy: "VIXY", proxyNote: "VIXY — short-term VIX futures (not spot VIX)" },
  { id: "US10Y", name: "US 10y Yield", cls: "indices", yahoo: "^TNX", proxy: "IEF", proxyNote: "IEF — 7-10y Treasury ETF (price, inverse to yield)" },

  // ─── Equities & ETFs (the liquid perp-listed names + commodity proxies) ───
  { id: "SPY", name: "SPY", cls: "equities", yahoo: "SPY", gains: "SPY/USD", pyth: "Equity.US.SPY/USD", av: "eq:SPY" },
  { id: "QQQ", name: "QQQ", cls: "equities", yahoo: "QQQ", gains: "QQQ/USD", pyth: "Equity.US.QQQ/USD", av: "eq:QQQ" },
  { id: "IWM", name: "IWM", cls: "equities", yahoo: "IWM", gains: "IWM/USD", av: "eq:IWM" },
  { id: "GLD", name: "GLD (gold ETF)", cls: "equities", yahoo: "GLD", pyth: "Equity.US.GLD/USD", av: "eq:GLD" },
  { id: "SLV", name: "SLV (silver ETF)", cls: "equities", yahoo: "SLV", av: "eq:SLV" },
  { id: "GDX", name: "GDX (gold miners)", cls: "equities", yahoo: "GDX", gains: "GDX/USD", av: "eq:GDX" },
  { id: "USO", name: "USO (oil ETF)", cls: "equities", yahoo: "USO", av: "eq:USO" },
  { id: "UNG", name: "UNG (natgas ETF)", cls: "equities", yahoo: "UNG", av: "eq:UNG" },
  { id: "URA", name: "URA (uranium)", cls: "equities", yahoo: "URA", gains: "URA/USD", av: "eq:URA" },
  { id: "TLT", name: "TLT (20y+ TSY)", cls: "equities", yahoo: "TLT", av: "eq:TLT" },
  { id: "XOM", name: "Exxon", cls: "equities", yahoo: "XOM", pyth: "Equity.US.XOM/USD", av: "eq:XOM" },
  { id: "CVX", name: "Chevron", cls: "equities", yahoo: "CVX", pyth: "Equity.US.CVX/USD", av: "eq:CVX" },
  { id: "AAPL", name: "Apple", cls: "equities", yahoo: "AAPL", gains: "AAPL/USD", pyth: "Equity.US.AAPL/USD", av: "eq:AAPL" },
  { id: "MSFT", name: "Microsoft", cls: "equities", yahoo: "MSFT", gains: "MSFT/USD", pyth: "Equity.US.MSFT/USD", av: "eq:MSFT" },
  { id: "NVDA", name: "Nvidia", cls: "equities", yahoo: "NVDA", gains: "NVDA/USD", pyth: "Equity.US.NVDA/USD", av: "eq:NVDA" },
  { id: "AMD", name: "AMD", cls: "equities", yahoo: "AMD", gains: "AMD/USD", pyth: "Equity.US.AMD/USD", av: "eq:AMD" },
  { id: "GOOGL", name: "Alphabet", cls: "equities", yahoo: "GOOGL", gains: "GOOGL/USD", pyth: "Equity.US.GOOGL/USD", av: "eq:GOOGL" },
  { id: "META", name: "Meta", cls: "equities", yahoo: "META", gains: "META/USD", pyth: "Equity.US.META/USD", av: "eq:META" },
  { id: "AMZN", name: "Amazon", cls: "equities", yahoo: "AMZN", gains: "AMZN/USD", pyth: "Equity.US.AMZN/USD", av: "eq:AMZN" },
  { id: "TSLA", name: "Tesla", cls: "equities", yahoo: "TSLA", gains: "TSLA/USD", pyth: "Equity.US.TSLA/USD", av: "eq:TSLA" },
  { id: "JPM", name: "JPMorgan", cls: "equities", yahoo: "JPM", pyth: "Equity.US.JPM/USD", av: "eq:JPM" },
  { id: "COIN", name: "Coinbase", cls: "equities", yahoo: "COIN", gains: "COIN/USD", pyth: "Equity.US.COIN/USD", av: "eq:COIN" },
  { id: "MSTR", name: "Strategy (MSTR)", cls: "equities", yahoo: "MSTR", gains: "MSTR/USD", pyth: "Equity.US.MSTR/USD", av: "eq:MSTR" },
  { id: "HOOD", name: "Robinhood", cls: "equities", yahoo: "HOOD", gains: "HOOD/USD", av: "eq:HOOD" },
  { id: "PLTR", name: "Palantir", cls: "equities", yahoo: "PLTR", gains: "PLTR/USD", av: "eq:PLTR" },

  // ─── Crypto reference block ───────────────────────────────────────────────
  { id: "BTCUSD", name: "Bitcoin", cls: "crypto", yahoo: "BTC-USD", hl: "BTC", gains: "BTC/USD", pyth: "Crypto.BTC/USD", gecko: "bitcoin" },
  { id: "ETHUSD", name: "Ethereum", cls: "crypto", yahoo: "ETH-USD", hl: "ETH", gains: "ETH/USD", pyth: "Crypto.ETH/USD", gecko: "ethereum" },
  { id: "SOLUSD", name: "Solana", cls: "crypto", yahoo: "SOL-USD", hl: "SOL", gains: "SOL/USD", pyth: "Crypto.SOL/USD", gecko: "solana" },
];

const byId = new Map(UNIVERSE.map((i) => [i.id, i]));

export function instrument(id: string): Instrument | undefined {
  return byId.get(id);
}

export function instrumentsFor(classes: string[]): Instrument[] {
  if (!classes.length) return UNIVERSE;
  const set = new Set(classes);
  return UNIVERSE.filter((i) => set.has(i.cls));
}

/** Pairs worth a hard look — the classic RWA relative-value trades. */
export const WATCHLIST: [string, string][] = [
  ["XAUUSD", "XAGUSD"],
  ["XAUUSD", "GDX"],
  ["GLD", "GDX"],
  ["WTI", "BRENT"],
  ["WTI", "XOM"],
  ["XOM", "CVX"],
  ["CORN", "WHEAT"],
  ["AUDUSD", "COPPER"],
  ["USDCAD", "WTI"],
  ["SPX500", "NAS100"],
  ["SPY", "QQQ"],
  ["XAUUSD", "DXY"],
  ["USDJPY", "US10Y"],
  ["XPTUSD", "XPDUSD"],
  ["MSTR", "BTCUSD"],
  ["COIN", "BTCUSD"],
  ["EURUSD", "GBPUSD"],
  ["AUDUSD", "NZDUSD"],
];
