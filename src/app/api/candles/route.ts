import { NextResponse } from "next/server";
import { costIndex, getManySeries, venueIndex } from "@/lib/providers";
import { buildSpread, computePair, indexTo100, rollingZ, scorePair } from "@/lib/stats";
import { timeframe } from "@/lib/types";
import { UNIVERSE, instrument } from "@/lib/universe";

/**
 * GET /api/candles?a=XAUUSD&b=XAGUSD&tf=1h
 * Returns both legs aligned on shared bars, indexed to 100 (the only honest
 * way to draw two differently-priced instruments on one axis), plus the fitted
 * spread and its rolling z-score.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const aId = q.get("a") ?? "XAUUSD";
  const bId = q.get("b") ?? "XAGUSD";
  const tf = timeframe(q.get("tf") ?? "1h");

  const a = instrument(aId);
  const b = instrument(bId);
  if (!a || !b) {
    return NextResponse.json({ error: `unknown instrument: ${!a ? aId : bId}` }, { status: 400 });
  }

  const { series, reports } = await getManySeries([a, b], tf, 2);
  const sa = series.find((s) => s.instrument === aId);
  const sb = series.find((s) => s.instrument === bId);
  if (!sa || !sb) {
    const missing = [!sa ? aId : null, !sb ? bId : null].filter(Boolean).join(" and ");
    const tried = reports
      .filter((r) => !r.source)
      .map((r) => `${r.instrument}: ${r.attempts.map((x) => `${x.provider} (${x.note ?? "no bars"})`).join("; ") || "no provider covers this instrument at this bar size"}`)
      .join(" · ");
    const intradayGap =
      !tf.daily && reports.some((r) => r.attempts.some((x) => /429|rate-limit/i.test(x.note ?? "")));
    return NextResponse.json(
      {
        error:
          `No provider could serve ${missing} at ${tf.label}. ${tried}` +
          (intradayGap
            ? " — Yahoo is the only keyless source of intraday bars for this asset class; set TWELVEDATA_API_KEY or ALPHAVANTAGE_API_KEY for an intraday fallback, or switch to a daily bar size."
            : ""),
        reports,
      },
      { status: 502 },
    );
  }

  const model = buildSpread(sa.candles, sb.candles);
  if (!model) {
    return NextResponse.json(
      { error: "fewer than 30 overlapping bars — the two sessions barely intersect", reports },
      { status: 422 },
    );
  }

  const v = await venueIndex(UNIVERSE).catch(() => null);
  const costs = v ? costIndex(v) : undefined;
  const stat = computePair(aId, bId, a.cls, b.cls, sa.candles, sb.candles, tf, costs);
  if (stat) stat.score = scorePair(stat, model.t.length);

  const rollWin = Math.max(20, Math.floor(model.t.length / 3));

  return NextResponse.json({
    a: {
      id: a.id,
      name: a.name,
      cls: a.cls,
      source: sa.source,
      proxiedBy: sa.proxiedBy,
      proxyNote: sa.proxiedBy ? a.proxyNote : undefined,
    },
    b: {
      id: b.id,
      name: b.name,
      cls: b.cls,
      source: sb.source,
      proxiedBy: sb.proxiedBy,
      proxyNote: sb.proxiedBy ? b.proxyNote : undefined,
    },
    tf: tf.id,
    tfLabel: tf.label,
    rollWindow: rollWin,
    t: model.t,
    priceA: model.pa,
    priceB: model.pb,
    indexA: indexTo100(model.pa),
    indexB: indexTo100(model.pb),
    fairA: model.fairA,
    spread: model.spread,
    z: model.z,
    zRolling: rollingZ(model.spread, rollWin),
    stat,
    reports,
  });
}
