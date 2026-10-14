import { NextResponse } from "next/server";
import { DEFAULT_PARAMS, runBacktest, suggestMaxBars, type BacktestParams } from "@/lib/backtest";
import { costIndex, getManySeries, venueIndex } from "@/lib/providers";
import { alignPair, buildSpread } from "@/lib/stats";
import { timeframe } from "@/lib/types";
import { UNIVERSE, instrument } from "@/lib/universe";

/**
 * GET /api/backtest?a=XAUUSD&b=XAGUSD&tf=1d&entryZ=2&exitZ=0.5&…
 *
 * Fees default to the real round-trip cost of each leg on its cheapest perp
 * venue; funding defaults to the venue's own published rate when there is one.
 * Every default can be overridden from the UI.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const aId = q.get("a") ?? "XAUUSD";
  const bId = q.get("b") ?? "XAGUSD";
  const tf = timeframe(q.get("tf") ?? "1d");

  const a = instrument(aId);
  const b = instrument(bId);
  if (!a || !b) {
    return NextResponse.json({ error: `unknown instrument: ${!a ? aId : bId}` }, { status: 400 });
  }

  const { series, reports } = await getManySeries([a, b], tf, 2);
  const sa = series.find((s) => s.instrument === aId);
  const sb = series.find((s) => s.instrument === bId);
  if (!sa || !sb) {
    return NextResponse.json(
      { error: "no reachable provider returned data for both legs", reports },
      { status: 502 },
    );
  }

  const { t, pa, pb } = alignPair(sa.candles, sb.candles);
  if (t.length < 40) {
    return NextResponse.json(
      { error: `only ${t.length} overlapping bars — too few to backtest`, reports },
      { status: 422 },
    );
  }

  // Venue-derived defaults, so the first run is already realistic.
  const v = await venueIndex(UNIVERSE).catch(() => null);
  const costs = v ? costIndex(v) : null;
  const venueFeeA = costs?.costBps.get(aId) ?? null;
  const venueFeeB = costs?.costBps.get(bId) ?? null;
  const venueFunding = v
    ? avgFunding([...(v.byInstrument.get(aId) ?? []), ...(v.byInstrument.get(bId) ?? [])])
    : null;

  // A pair can only be levered as far as its *more restrictive* leg allows —
  // 5× equities against 100× forex means the pair caps at 5×.
  const levA = bestLeverage(v?.byInstrument.get(aId) ?? []);
  const levB = bestLeverage(v?.byInstrument.get(bId) ?? []);
  // Only a pair with BOTH legs listed has a venue cap. Borrowing the listed
  // leg's cap when the other leg has no perp at all would invent a limit for a
  // trade that cannot be put on in the first place.
  const venueMaxLeverage = levA !== null && levB !== null ? Math.min(levA, levB) : null;
  const requested = num(q, "leverage", DEFAULT_PARAMS.leverage, 1, 200);
  const leverage = venueMaxLeverage ? Math.min(requested, venueMaxLeverage) : requested;

  const model = buildSpread(sa.candles, sb.candles);
  const suggested = model ? suggestMaxBars(model.spread) : 0;

  const params: Partial<BacktestParams> = {
    lookback: int(q, "lookback", DEFAULT_PARAMS.lookback, 20, 500),
    entryZ: num(q, "entryZ", DEFAULT_PARAMS.entryZ, 0.5, 6),
    exitZ: num(q, "exitZ", DEFAULT_PARAMS.exitZ, 0, 3),
    stopZ: num(q, "stopZ", DEFAULT_PARAMS.stopZ, 1, 12),
    maxBars: int(q, "maxBars", suggested, 0, 5000),
    capital: num(q, "capital", DEFAULT_PARAMS.capital, 1, 1e9),
    leverage,
    maintenanceMarginPct: num(
      q,
      "maintenanceMarginPct",
      DEFAULT_PARAMS.maintenanceMarginPct,
      0,
      50,
    ),
    feeBpsA: num(q, "feeBpsA", venueFeeA ?? DEFAULT_PARAMS.feeBpsA, 0, 500),
    feeBpsB: num(q, "feeBpsB", venueFeeB ?? DEFAULT_PARAMS.feeBpsB, 0, 500),
    fundingBpsPerDay: num(q, "fundingBpsPerDay", venueFunding ?? DEFAULT_PARAMS.fundingBpsPerDay, -100, 100),
    slippageBps: num(q, "slippageBps", DEFAULT_PARAMS.slippageBps, 0, 200),
    side: (["both", "long", "short"].includes(q.get("side") ?? "") ? q.get("side") : "both") as
      | "both"
      | "long"
      | "short",
    from: int(q, "from", 0, 0, 4e9),
    to: int(q, "to", 0, 0, 4e9),
  };

  const result = runBacktest(t, pa, pb, tf, params);

  return NextResponse.json({
    a: { id: a.id, name: a.name, cls: a.cls, source: sa.source, proxiedBy: sa.proxiedBy },
    b: { id: b.id, name: b.name, cls: b.cls, source: sb.source, proxiedBy: sb.proxiedBy },
    tf: tf.id,
    tfLabel: tf.label,
    barSeconds: tf.seconds,
    dataFrom: t[0],
    dataTo: t[t.length - 1],
    defaults: {
      feeBpsA: venueFeeA,
      feeBpsB: venueFeeB,
      fundingBpsPerDay: venueFunding,
      maxBars: suggested,
      maxLeverage: venueMaxLeverage,
      maxLeverageA: levA,
      maxLeverageB: levB,
      leverageClamped: leverage < requested ? requested : null,
      venuesA: (v?.byInstrument.get(aId) ?? []).map((l) => l.venue),
      venuesB: (v?.byInstrument.get(bId) ?? []).map((l) => l.venue),
    },
    ...result,
  });
}

/** The most leverage any venue listing this leg allows. */
function bestLeverage(listings: { maxLeverage?: number }[]): number | null {
  const vals = listings.map((l) => l.maxLeverage).filter((x): x is number => typeof x === "number" && x > 0);
  return vals.length ? Math.max(...vals) : null;
}

/** Venue funding is per hour; the backtest charges per day. */
function avgFunding(listings: { carryBpsPerHour?: number }[]): number | null {
  const vals = listings.map((l) => l.carryBpsPerHour).filter((x): x is number => typeof x === "number");
  if (!vals.length) return null;
  const perHour = vals.reduce((s, x) => s + Math.abs(x), 0) / vals.length;
  return perHour * 24;
}

function num(q: URLSearchParams, key: string, fallback: number, lo: number, hi: number): number {
  const raw = q.get(key);
  if (raw === null || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function int(q: URLSearchParams, key: string, fallback: number, lo: number, hi: number): number {
  return Math.round(num(q, key, fallback, lo, hi));
}
