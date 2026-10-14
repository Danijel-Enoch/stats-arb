import { NextResponse } from "next/server";
import { costIndex, getManySeries, venueIndex } from "@/lib/providers";
import { alignMany, computePair, pearson } from "@/lib/stats";
import { scorePair } from "@/lib/stats";
import { logReturns } from "@/lib/stats";
import { timeframe, type PairStat } from "@/lib/types";
import { UNIVERSE, WATCHLIST, instrumentsFor } from "@/lib/universe";

export const maxDuration = 300;

/**
 * GET /api/scan?cls=fx,metals,energy&tf=1d&minCorr=0.6&tradableOnly=1
 *
 * Fetches every instrument in the selected classes once, then scores all
 * pairs. Cross-class pairs are included on purpose — gold/miners, oil/Exxon
 * and CAD/crude are the trades that actually pay, and they are all cross-class.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const tf = timeframe(q.get("tf") ?? "1d");
  const classes = (q.get("cls") ?? "fx,metals,energy,indices")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const minCorr = Number(q.get("minCorr") ?? 0.6);
  const tradableOnly = q.get("tradableOnly") === "1";
  const limit = Math.min(400, Number(q.get("limit") ?? 150));
  const maxInstruments = Math.min(90, Number(q.get("maxInstruments") ?? 60));

  const chosen = instrumentsFor(classes).slice(0, maxInstruments);
  if (chosen.length < 2) {
    return NextResponse.json({ error: "pick at least two instruments' worth of classes" }, { status: 400 });
  }

  const [{ series, reports }, v] = await Promise.all([
    getManySeries(chosen, tf, 6),
    venueIndex(UNIVERSE).catch(() => null),
  ]);

  const costs = v ? costIndex(v) : undefined;
  const byId = new Map(series.map((s) => [s.instrument, s]));
  const live = chosen.filter((i) => byId.has(i.id));

  const pairs: PairStat[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i];
      const B = live[j];
      const p = computePair(
        A.id,
        B.id,
        A.cls,
        B.cls,
        byId.get(A.id)!.candles,
        byId.get(B.id)!.candles,
        tf,
        costs,
      );
      if (!p) continue;
      if (Math.abs(p.corr) < minCorr) continue;
      if (tradableOnly && !p.tradable) continue;
      p.score = scorePair(p, p.n);
      pairs.push(p);
    }
  }

  pairs.sort((x, y) => y.score - x.score || Math.abs(y.zRolling) - Math.abs(x.zRolling));

  // Correlation matrix over the instruments that made the cut, for the heatmap.
  const matrixIds = dedupe([...pairs.slice(0, 20).flatMap((p) => [p.a, p.b])]).slice(0, 20);
  const matrix = correlationMatrix(matrixIds, byId);

  const failed = reports.filter((r) => !r.source);

  return NextResponse.json({
    tf: tf.id,
    tfLabel: tf.label,
    classes,
    instrumentsRequested: chosen.length,
    instrumentsLive: live.length,
    pairsTested: (live.length * (live.length - 1)) / 2,
    pairsReturned: Math.min(pairs.length, limit),
    sessions: v?.sessions ?? {},
    sources: countBy(series.map((s) => s.source)),
    proxied: reports
      .filter((r) => r.proxiedBy)
      .map((r) => ({ instrument: r.instrument, proxy: r.proxiedBy! })),
    unavailable: failed.map((f) => ({
      instrument: f.instrument,
      tried: f.attempts.map((a) => `${a.provider}: ${a.note ?? "ok"}`),
    })),
    watchlist: WATCHLIST.filter(([a, b]) => byId.has(a) && byId.has(b)).map(([a, b]) => `${a}|${b}`),
    matrix,
    pairs: pairs.slice(0, limit),
  });
}

function correlationMatrix(ids: string[], byId: Map<string, { candles: { t: number; c: number }[] }>) {
  const series = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((s, n) => ({ instrument: ids[n], source: "", candles: s!.candles as never }));
  const { prices } = alignMany(series);
  const rets = prices.map((p) => logReturns(p));
  const rows = ids.map((_, i) => ids.map((__, j) => (i === j ? 1 : round(pearson(rets[i] ?? [], rets[j] ?? []), 4))));
  return { ids, rows, bars: prices[0]?.length ?? 0 };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

function countBy(xs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
