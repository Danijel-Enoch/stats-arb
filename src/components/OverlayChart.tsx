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

const PAD = { top: 16, right: 18, bottom: 26, left: 52 };
const HEIGHT = 300;
const HEIGHT_SM = 210;

/** Phones get a shorter plot so the chart and its header still fit a screen. */
function plotHeight(width: number): number {
  return width < 560 ? HEIGHT_SM : HEIGHT;
}

/**
 * The two instruments overlaid on ONE axis, each indexed to 100 at the first
 * shared bar. Two price axes would let the chart invent a relationship by
 * choosing where the scales line up; indexing shows the real relative move and
 * the raw prices still live in the crosshair and the table view.
 */
export default function OverlayChart({
  data,
  hoverIndex,
  onHover,
  stale,
}: {
  data: PairResponse;
  hoverIndex: number | null;
  onHover: (i: number | null) => void;
  stale?: boolean;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [showTable, setShowTable] = useState(false);
  const n = data.t.length;
  const H = plotHeight(width);
  const intraday = data.tf === "15m" || data.tf === "1h" || data.tf === "4h";

  const geom = useMemo(() => {
    const x = linear([0, Math.max(1, n - 1)], [PAD.left, Math.max(PAD.left + 10, width - PAD.right)]);
    const yDomain = nicePadded([...data.indexA, ...data.indexB]);
    const y = linear(yDomain, [H - PAD.bottom, PAD.top]);
    const xs = data.t.map((_, i) => x(i));
    return {
      x,
      y,
      xs,
      yTicks: ticks(yDomain, 5),
      dA: path(xs, data.indexA.map(y)),
      dB: path(xs, data.indexB.map(y)),
    };
  }, [data, n, width, H]);

  const { handlers } = useCrosshair(n, geom.x, onHover);
  const i = hoverIndex ?? null;
  const last = n - 1;

  const xLabels = useMemo(() => {
    const picks = [0, Math.floor(last / 3), Math.floor((2 * last) / 3), last].filter(
      (v, k, arr) => arr.indexOf(v) === k,
    );
    return picks.map((k) => ({ px: geom.x(k), text: fmt.axisDate(data.t[k], intraday) }));
  }, [data.t, geom, intraday, last]);

  return (
    <section className="card p-4" aria-labelledby="overlay-title">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="overlay-title" className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            {data.a.name} vs {data.b.name}
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            Indexed to 100 at the first shared bar · {data.tfLabel} · {n} overlapping bars
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Legend data={data} />
          <button
            type="button"
            className="chip"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
          >
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
          aria-label={`${data.a.name} and ${data.b.name}, both indexed to 100 at the first shared bar`}
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
          {...handlers}
        >
          <GridLines xRange={[PAD.left, width - PAD.right]} values={geom.yTicks} y={geom.y} />
          <YAxis x={PAD.left - 8} values={geom.yTicks} y={geom.y} format={(v) => fmt.num(v, 0)} />
          <XAxis y={H - PAD.bottom} xRange={[PAD.left, width - PAD.right]} labels={xLabels} />

          {/* 100 = the common base both legs start from */}
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={geom.y(100)}
            y2={geom.y(100)}
            stroke="var(--axis)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />

          <path d={geom.dB} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
          <path d={geom.dA} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />

          {/* endpoint direct labels — identity never rests on colour alone */}
          {n > 1 && (
            <>
              <EndLabel
                x={geom.x(last)}
                y={geom.y(data.indexA[last])}
                text={data.a.id}
                color="var(--series-1)"
                plotRight={width - PAD.right}
              />
              <EndLabel
                x={geom.x(last)}
                y={geom.y(data.indexB[last])}
                text={data.b.id}
                color="var(--series-2)"
                plotRight={width - PAD.right}
              />
            </>
          )}

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
              <circle cx={geom.x(i)} cy={geom.y(data.indexB[i])} r={4} fill="var(--series-2)" stroke="var(--surface-1)" strokeWidth={2} />
              <circle cx={geom.x(i)} cy={geom.y(data.indexA[i])} r={4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
              <Tooltip x={geom.x(i)} y={PAD.top} width={210} plotWidth={width}>
                <div style={{ color: "var(--text-muted)", marginBottom: 3 }}>
                  {fmt.dateShort(data.t[i], intraday)}
                </div>
                <Row color="var(--series-1)" label={data.a.id} price={data.priceA[i]} idx={data.indexA[i]} />
                <Row color="var(--series-2)" label={data.b.id} price={data.priceB[i]} idx={data.indexB[i]} />
                <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                  spread z <span className="tnum">{fmt.signed(data.zRolling[i])}σ</span>
                </div>
              </Tooltip>
            </g>
          )}
        </svg>
      </div>

      {showTable && <OverlayTable data={data} intraday={intraday} />}
    </section>
  );
}

function Row({ color, label, price, idx }: { color: string; label: string; price: number; idx: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flex: "0 0 auto" }} />
      <span style={{ color: "var(--text-secondary)", minWidth: 58 }}>{label}</span>
      <span className="tnum" style={{ color: "var(--text-primary)" }}>
        {fmt.price(price)}
      </span>
      <span className="tnum" style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
        {fmt.num(idx, 1)}
      </span>
    </div>
  );
}

function EndLabel({
  x,
  y,
  text,
  color,
  plotRight,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  plotRight: number;
}) {
  const anchor = x + 6 + text.length * 6.4 > plotRight ? "end" : "start";
  return (
    <>
      <circle cx={x} cy={y} r={3.5} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
      {/* A surface-coloured halo keeps the label legible when a narrow plot
          forces it back over the series line. */}
      <text
        x={anchor === "start" ? x + 7 : x - 7}
        y={y}
        dy="0.32em"
        textAnchor={anchor}
        fontSize={10.5}
        fontWeight={600}
        fill="var(--text-secondary)"
        stroke="var(--surface-1)"
        strokeWidth={3}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {text}
      </text>
    </>
  );
}

function Legend({ data }: { data: PairResponse }) {
  return (
    <div className="flex items-center gap-3.5 text-[12.5px]">
      {[
        { c: "var(--series-1)", id: data.a.id, src: data.a.source, proxy: data.a.proxiedBy },
        { c: "var(--series-2)", id: data.b.id, src: data.b.source, proxy: data.b.proxiedBy },
      ].map((s) => (
        <span key={s.id} className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: s.c }} />
          {s.id}
          <span className="text-[var(--text-muted)]">
            {s.proxy ? `via ${s.proxy}` : s.src}
          </span>
        </span>
      ))}
    </div>
  );
}

function OverlayTable({ data, intraday }: { data: PairResponse; intraday: boolean }) {
  // Last 40 bars, newest first — the chart's WCAG-clean twin.
  const rows = data.t.map((_, i) => i).reverse().slice(0, 40);
  return (
    <div className="scroll-x mt-3 max-h-72 overflow-y-auto border-t pt-2 hair">
      <table className="grid-table tnum">
        <caption className="sr-only">
          Closing prices, index levels and spread z-score for the last 40 shared bars
        </caption>
        <thead>
          <tr>
            <th scope="col">Bar</th>
            <th scope="col">{data.a.id}</th>
            <th scope="col">{data.b.id}</th>
            <th scope="col">idx {data.a.id}</th>
            <th scope="col">idx {data.b.id}</th>
            <th scope="col">z</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={data.t[i]}>
              <td>{fmt.dateShort(data.t[i], intraday)}</td>
              <td>{fmt.price(data.priceA[i])}</td>
              <td>{fmt.price(data.priceB[i])}</td>
              <td>{fmt.num(data.indexA[i], 1)}</td>
              <td>{fmt.num(data.indexB[i], 1)}</td>
              <td>{fmt.signed(data.zRolling[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
