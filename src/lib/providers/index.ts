import { cached, peek } from "../cache";
import type {
  CandleProvider,
  Instrument,
  ProviderHealth,
  Series,
  Timeframe,
  VenueListing,
} from "../types";
import { alphavantage } from "./alphavantage";
import { coingecko } from "./coingecko";
import { frankfurter } from "./frankfurter";
import { gainsProbe, gainsSnapshot } from "./gains";
import { hlListings, hyperliquid } from "./hyperliquid";
import { nasdaq } from "./nasdaq";
import { pythProbe } from "./pyth";
import { twelvedata } from "./twelvedata";
import { yahoo } from "./yahoo";

export const CANDLE_PROVIDERS: CandleProvider[] = [
  yahoo,
  twelvedata,
  nasdaq,
  hyperliquid,
  alphavantage,
  frankfurter,
  coingecko,
].sort((a, b) => a.priority - b.priority);

const HEALTH_TTL = 60_000;
const HEALTH_KEY = "health:all";

/** Venue providers are health-checked alongside the candle providers. */
const VENUE_PROBES: { id: string; label: string; probe: () => Promise<{ ok: boolean; note?: string; needsKey?: boolean }> }[] = [
  { id: "gtrade", label: "gTrade (Gains)", probe: gainsProbe },
  { id: "pyth", label: "Pyth Network", probe: pythProbe },
];

export async function health(force = false): Promise<ProviderHealth[]> {
  if (force) {
    const fresh = await runHealth();
    return fresh;
  }
  return cached(HEALTH_KEY, HEALTH_TTL, runHealth);
}

async function runHealth(): Promise<ProviderHealth[]> {
  const jobs: Promise<ProviderHealth>[] = [];
  for (const p of CANDLE_PROVIDERS) {
    jobs.push(timed(p.id, p.label, () => p.probe()));
  }
  for (const v of VENUE_PROBES) {
    jobs.push(timed(v.id, v.label, v.probe));
  }
  // Hyperliquid answers for both candles and venue data; probe once.
  return Promise.all(jobs);
}

async function timed(
  id: string,
  label: string,
  probe: () => Promise<{ ok: boolean; note?: string; needsKey?: boolean }>,
): Promise<ProviderHealth> {
  const t0 = Date.now();
  try {
    const r = await probe();
    return { id, label, ok: r.ok, note: r.note, needsKey: r.needsKey, ms: Date.now() - t0, checkedAt: Date.now() };
  } catch (e) {
    return {
      id,
      label,
      ok: false,
      note: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
      checkedAt: Date.now(),
    };
  }
}

function healthyIds(): Set<string> | null {
  const h = peek<ProviderHealth[]>(HEALTH_KEY);
  if (!h) return null;
  return new Set(h.filter((x) => x.ok).map((x) => x.id));
}

export interface FetchReport {
  instrument: string;
  source?: string;
  proxiedBy?: string;
  bars: number;
  attempts: { provider: string; ok: boolean; note?: string }[];
}

/**
 * Walk the provider chain in priority order and take the first one that
 * actually answers. Providers already known to be down are tried last rather
 * than skipped outright, so a stale health check can never make an instrument
 * unfetchable.
 */
export async function getSeries(
  inst: Instrument,
  tf: Timeframe,
): Promise<{ series: Series | null; report: FetchReport }> {
  const ok = healthyIds();
  const eligible = CANDLE_PROVIDERS.filter((p) => p.supports(inst, tf));
  const ordered = ok
    ? [...eligible].sort((a, b) => Number(ok.has(b.id)) - Number(ok.has(a.id)) || a.priority - b.priority)
    : eligible;

  const report: FetchReport = { instrument: inst.id, bars: 0, attempts: [] };
  for (const p of ordered) {
    try {
      const candles = await p.fetchCandles(inst, tf);
      if (candles.length < 10) {
        report.attempts.push({ provider: p.id, ok: false, note: `only ${candles.length} bars` });
        continue;
      }
      report.attempts.push({ provider: p.id, ok: true });
      report.source = p.id;
      report.bars = candles.length;
      return { series: { instrument: inst.id, source: p.id, candles }, report };
    } catch (e) {
      report.attempts.push({ provider: p.id, ok: false, note: e instanceof Error ? e.message : String(e) });
    }
  }
  // Every direct provider failed. Fall back to the ETF proxy if there is one,
  // and label the result so nobody mistakes GLD for spot gold.
  if (inst.proxy) {
    const stand: Instrument = {
      id: inst.id,
      name: inst.name,
      cls: inst.cls,
      yahoo: inst.proxy,
      nasdaq: inst.proxy,
      twelve: inst.proxy,
      av: `eq:${inst.proxy}`,
    };
    for (const p of CANDLE_PROVIDERS.filter((x) => x.supports(stand, tf))) {
      try {
        const candles = await p.fetchCandles(stand, tf);
        if (candles.length < 10) continue;
        report.attempts.push({ provider: `${p.id}→${inst.proxy}`, ok: true, note: "ETF proxy" });
        report.source = p.id;
        report.bars = candles.length;
        report.proxiedBy = inst.proxy;
        return {
          series: { instrument: inst.id, source: p.id, candles, proxiedBy: inst.proxy },
          report,
        };
      } catch (e) {
        report.attempts.push({
          provider: `${p.id}→${inst.proxy}`,
          ok: false,
          note: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { series: null, report };
}

/** Fetch many instruments with a concurrency cap, so we stay polite upstream. */
export async function getManySeries(
  instruments: Instrument[],
  tf: Timeframe,
  concurrency = 6,
): Promise<{ series: Series[]; reports: FetchReport[] }> {
  const series: Series[] = [];
  const reports: FetchReport[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, instruments.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= instruments.length) return;
      const { series: s, report } = await getSeries(instruments[idx], tf);
      reports.push(report);
      if (s) series.push(s);
    }
  });
  await Promise.all(workers);
  // keep the caller's ordering stable
  const rank = new Map(instruments.map((x, n) => [x.id, n]));
  series.sort((a, b) => (rank.get(a.instrument) ?? 0) - (rank.get(b.instrument) ?? 0));
  return { series, reports };
}

/* ── venues ─────────────────────────────────────────────────────────────── */

export interface VenueIndex {
  /** instrument id → every venue it is perp-listed on */
  byInstrument: Map<string, VenueListing[]>;
  sessions: Record<string, boolean>;
  gainsRefreshed?: string;
  errors: string[];
}

export async function venueIndex(universe: Instrument[]): Promise<VenueIndex> {
  const errors: string[] = [];
  const byInstrument = new Map<string, VenueListing[]>();
  let sessions: Record<string, boolean> = {};
  let gainsRefreshed: string | undefined;

  const [g, h] = await Promise.allSettled([gainsSnapshot(), hlListings()]);

  if (g.status === "fulfilled") {
    sessions = g.value.sessions;
    gainsRefreshed = g.value.lastRefreshed;
    for (const inst of universe) {
      if (!inst.gains) continue;
      const l = g.value.listings.get(inst.gains);
      if (l) push(byInstrument, inst.id, l);
    }
  } else {
    errors.push(`gtrade: ${reason(g)}`);
  }

  if (h.status === "fulfilled") {
    for (const inst of universe) {
      if (!inst.hl) continue;
      const l = h.value.get(inst.hl);
      if (l) push(byInstrument, inst.id, l);
    }
  } else {
    errors.push(`hyperliquid: ${reason(h)}`);
  }

  return { byInstrument, sessions, gainsRefreshed, errors };
}

/** Cheapest round-trip cost per instrument, for the net-edge column. */
export function costIndex(v: VenueIndex) {
  const costBps = new Map<string, number | null>();
  const venues = new Map<string, string[]>();
  for (const [id, listings] of v.byInstrument) {
    const costs = listings.map((l) => l.costBps).filter((c): c is number => typeof c === "number");
    costBps.set(id, costs.length ? Math.min(...costs) : null);
    venues.set(id, listings.map((l) => l.venue));
  }
  return { costBps, venues };
}

function push<T>(m: Map<string, T[]>, k: string, v: T) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

function reason(r: PromiseRejectedResult | PromiseSettledResult<unknown>): string {
  return r.status === "rejected"
    ? r.reason instanceof Error
      ? r.reason.message
      : String(r.reason)
    : "";
}
