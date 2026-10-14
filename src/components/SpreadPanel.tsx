"use client";

import { useMemo, useState } from "react";
import {
  GridLines,
  Tooltip,
  XAxis,
  YAxis,
  fmt,
  linear,
  nicePadded,
  path,
  ticks,
  useCrosshair,
  useMeasure,
} from "./chart-kit";
import type { PairResponse } from "@/lib/client-types";
import type { Trade } from "@/lib/backtest";

const PAD = { top: 14, right: 18, bottom: 26, left: 52 };
const HEIGHT = 190;
const HEIGHT_SM = 150;

/** Phones get a shorter plot so the chart and its header still fit a screen. */
function plotHeight(width: number): number {
  return width < 560 ? HEIGHT_SM : HEIGHT;
}

/**
 * The tradeable residual: log(A) − (α + β·log(B)), expressed in σ. Its own
 * panel because σ and an index level are different quantities — stacking them
 * on one axis is the dual-axis mistake in disguise.
 *
 * Beyond ±2σ the shading is diverging: red above (spread rich → short A, long
 * B), blue below (spread cheap → long A, short B). The labels carry the
 * meaning; the colour only reinforces it.
 */
export default function SpreadPanel({
  data,
  hoverIndex,
  onHover,
  stale,
  trades,
}: {
  data: PairResponse;
  hoverIndex: number | null;
  onHover: (i: number | null) => void;
  stale?: boolean;
  /** Backtest trades, marked on the same z-score they were taken from. */
  trades?: Trade[] | null;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [showTable, setShowTable] = useState(false);
  const n = data.t.length;
  const H = plotHeight(width);
  const intraday = data.tf === "15m" || data.tf === "1h" || data.tf === "4h";
  const z = data.zRolling;

  const geom = useMemo(() => {
    const x = linear([0, Math.max(1, n - 1)], [PAD.left, Math.max(PAD.left + 10, width - PAD.right)]);
    const bound = Math.max(2.6, Math.ceil(Math.max(...z.map(Math.abs)) * 10) / 10);
    const yDomain = nicePadded([-bound, bound], 0.02);
    const y = linear(yDomain, [H - PAD.bottom, PAD.top]);
    const xs = data.t.map((_, i) => x(i));
    return { x, y, xs, yTicks: ticks(yDomain, 5).filter((v) => Math.abs(v) <= bound), d: path(xs, z.map(y)) };
  }, [data.t, n, width, z, H]);

  const { handlers } = useCrosshair(n, geom.x, onHover);
  const i = hoverIndex;
  const plotL = PAD.left;
  const plotR = width - PAD.right;

  const xLabels = useMemo(() => {
    const last = n - 1;
    const picks = [0, Math.floor(last / 3), Math.floor((2 * last) / 3), last].filter(
      (v, k, arr) => arr.indexOf(v) === k,
    );
    return picks.map((k) => ({ px: geom.x(k), text: fmt.axisDate(data.t[k], intraday) }));
  }, [data.t, geom, intraday, n]);

  // Map each trade's entry/exit timestamp onto a bar index.
  const marks = useMemo(() => {
    if (!trades?.length) return [];
    const idx = new Map<number, number>();
    data.t.forEach((ts, i) => idx.set(ts, i));
    return trades.flatMap((tr) => {
      const i0 = idx.get(tr.entryT);
      const i1 = idx.get(tr.exitT);
      if (i0 === undefined || i1 === undefined) return [];
      return [{ trade: tr, i0, i1 }];
    });
  }, [data.t, trades]);

  const now = z[n - 1] ?? 0;
  const signal =
    now >= 2
      ? { text: `Spread rich — short ${data.a.id}, long ${data.b.id}`, color: "var(--critical)" }
      : now <= -2
        ? { text: `Spread cheap — long ${data.a.id}, short ${data.b.id}`, color: "var(--div-neg)" }
        : { text: "Inside the ±2σ band — no entry", color: "var(--text-muted)" };

  return (
    <section className="card p-4" aria-labelledby="spread-title">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="spread-title" className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Spread z-score · β = {fmt.num(data.stat?.beta ?? 0, 3)}
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            log({data.a.id}) − (α + β·log({data.b.id})) · rolling {data.rollWindow}-bar window · β fit
            in-sample
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: signal.color }}>
            <span aria-hidden="true">{Math.abs(now) >= 2 ? "◆" : "○"}</span>
            {signal.text}
          </span>
          {marks.length > 0 && (
            <span
              className="text-[12.5px] text-[var(--text-muted)]"
              title="Shaded bands are backtest holding periods, green for profit and red for loss. The markers sit on the time axis because the backtest refits z walk-forward — it is a different series from the line above."
            >
              {marks.length} backtest trades shaded
            </span>
          )}
          <button type="button" className="chip" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            Table
          </button>
        </div>
      </header>

      <div ref={ref} className={stale ? "stale" : undefined}>
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${width} ${H}`}
          preserveAspectRatio="none"
          role="img"
          tabIndex={0}
          aria-label={`Spread z-score, currently ${fmt.num(now, 2)} standard deviations`}
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
          {...handlers}
        >
          {/* entry zones beyond ±2σ */}
          <rect
            x={plotL}
            y={geom.y(geom.y.domain[1])}
            width={Math.max(0, plotR - plotL)}
            height={Math.max(0, geom.y(2) - geom.y(geom.y.domain[1]))}
            fill="var(--div-pos)"
            opacity={0.1}
          />
          <rect
            x={plotL}
            y={geom.y(-2)}
            width={Math.max(0, plotR - plotL)}
            height={Math.max(0, geom.y(geom.y.domain[0]) - geom.y(-2))}
            fill="var(--div-neg)"
            opacity={0.1}
          />

          <GridLines xRange={[plotL, plotR]} values={geom.yTicks} y={geom.y} />
          <YAxis x={plotL - 8} values={geom.yTicks} y={geom.y} format={(v) => fmt.num(v, 0) + "σ"} />
          <XAxis y={H - PAD.bottom} xRange={[plotL, plotR]} labels={xLabels} />

          {/* the mean, and the ±2σ triggers */}
          {[0, 2, -2].map((v) => (
            <line
              key={v}
              x1={plotL}
              x2={plotR}
              y1={geom.y(v)}
              y2={geom.y(v)}
              stroke={v === 0 ? "var(--axis)" : v > 0 ? "var(--div-pos)" : "var(--div-neg)"}
              strokeWidth={1}
              opacity={v === 0 ? 1 : 0.55}
              shapeRendering="crispEdges"
            />
          ))}

          {/* Backtest holding periods. The markers sit on the time axis, NOT on
              the line: the backtest's z is refit walk-forward at every bar, so
              it is a different series from the in-sample z drawn here, and
              putting a marker on this line would imply a precision that does
              not exist. */}
          {marks.map(({ trade, i0, i1 }) => (
            <rect
              key={trade.id}
              x={geom.x(i0)}
              y={PAD.top}
              width={Math.max(1.5, geom.x(i1) - geom.x(i0))}
              height={H - PAD.bottom - PAD.top}
              fill={trade.win ? "var(--good)" : "var(--critical)"}
              opacity={0.13}
            />
          ))}

          <path d={geom.d} fill="none" stroke="var(--text-primary)" strokeWidth={1.75} strokeLinejoin="round" />

          {marks.map(({ trade, i0, i1 }) => {
            const base = H - PAD.bottom;
            return (
              <g key={`m-${trade.id}`}>
                <polygon
                  points={`${geom.x(i0)},${base - 7} ${geom.x(i0) - 4},${base - 1} ${geom.x(i0) + 4},${base - 1}`}
                  fill="var(--surface-1)"
                  stroke={trade.side === "long" ? "var(--div-neg)" : "var(--div-pos)"}
                  strokeWidth={1.5}
                >
                  <title>{`#${trade.id} open ${trade.side} spread — backtest z ${fmt.signed(trade.entryZ)}σ`}</title>
                </polygon>
                <circle
                  cx={geom.x(i1)}
                  cy={base - 4}
                  r={3.5}
                  fill={trade.win ? "var(--good)" : "var(--critical)"}
                  stroke="var(--surface-1)"
                  strokeWidth={1.5}
                >
                  <title>
                    {`#${trade.id} close (${trade.reason}) — ${trade.win ? "profit" : "loss"}, backtest z ${fmt.signed(trade.exitZ)}σ`}
                  </title>
                </circle>
              </g>
            );
          })}

          {i !== null && i >= 0 && i < n && (
            <g>
              <line
                x1={geom.x(i)}
                x2={geom.x(i)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--axis)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <circle cx={geom.x(i)} cy={geom.y(z[i])} r={4} fill="var(--text-primary)" stroke="var(--surface-1)" strokeWidth={2} />
              <Tooltip x={geom.x(i)} y={PAD.top} width={190} plotWidth={width}>
                <div style={{ color: "var(--text-muted)", marginBottom: 3 }}>
                  {fmt.dateShort(data.t[i], intraday)}
                </div>
                <div className="tnum">
                  z <strong>{fmt.signed(z[i])}σ</strong>
                </div>
                <div className="tnum" style={{ color: "var(--text-secondary)" }}>
                  dislocation {fmt.bps(Math.abs(z[i]) * (data.stat?.spreadSdBps ?? 0))}
                </div>
                <div className="tnum" style={{ color: "var(--text-secondary)" }}>
                  fair {data.a.id} {fmt.price(data.fairA[i])} vs {fmt.price(data.priceA[i])}
                </div>
              </Tooltip>
            </g>
          )}
        </svg>
      </div>

      {showTable && (
        <div className="scroll-x mt-3 max-h-64 overflow-y-auto border-t pt-2 hair">
          <table className="grid-table tnum">
            <caption className="sr-only">Spread z-score and implied dislocation, last 40 bars</caption>
            <thead>
              <tr>
                <th scope="col">Bar</th>
                <th scope="col">z (σ)</th>
                <th scope="col">Dislocation</th>
                <th scope="col">Fair {data.a.id}</th>
                <th scope="col">Actual</th>
              </tr>
            </thead>
            <tbody>
              {data.t
                .map((_, k) => k)
                .reverse()
                .slice(0, 40)
                .map((k) => (
                  <tr key={data.t[k]}>
                    <td>{fmt.dateShort(data.t[k], intraday)}</td>
                    <td>{fmt.signed(z[k])}</td>
                    <td>{fmt.bps(Math.abs(z[k]) * (data.stat?.spreadSdBps ?? 0))}</td>
                    <td>{fmt.price(data.fairA[k])}</td>
                    <td>{fmt.price(data.priceA[k])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
