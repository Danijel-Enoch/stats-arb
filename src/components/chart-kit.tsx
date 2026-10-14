"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/* Shared chart plumbing: scales, hairline chrome, and one crosshair that the
   overlay and the spread panel both read from, so the two plots always point
   at the same bar. */

export interface Scale {
  (v: number): number;
  invert(px: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  fn.invert = (px: number) => d0 + ((px - r0) / (r1 - r0 || 1)) * span;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

export function nicePadded(values: number[], padFrac = 0.06): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return [0, 1];
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * padFrac;
  return [lo - pad, hi + pad];
}

/** ~5 round tick values inside a domain. */
export function ticks([lo, hi]: [number, number], count = 5): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(round(v, 10));
  return out;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/**
 * Measures the container the chart draws into.
 *
 * Starts small on purpose. Charts render with a viewBox and `width="100%"`, so
 * the SVG never contributes an intrinsic width — but if a chart ever did, a
 * large initial guess would widen its own container and the measurement would
 * latch at the wrong size. Starting narrow makes that failure mode impossible.
 */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number) => {
      // functional update: comparing against a captured `width` would go stale
      if (w > 0) setWidth((prev) => (Math.abs(w - prev) > 1 ? w : prev));
    };
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    apply(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Maps pointer position to the nearest bar index. Hit area is the whole plot,
 *  so there is no pinpoint target to land on. */
export function useCrosshair(count: number, x: Scale, onChange?: (i: number | null) => void) {
  const [index, setIndex] = useState<number | null>(null);
  const set = useCallback(
    (i: number | null) => {
      setIndex(i);
      onChange?.(i);
    },
    [onChange],
  );
  const handlers = {
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const i = Math.round(x.invert(px));
      set(i < 0 ? 0 : i >= count ? count - 1 : i);
    },
    onPointerLeave: () => set(null),
    onFocus: () => set(count - 1),
    onBlur: () => set(null),
    onKeyDown: (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (index === null) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        set(Math.max(0, index - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        set(Math.min(count - 1, index + 1));
      } else if (e.key === "Escape") {
        set(null);
      }
    },
  };
  return { index, setIndex: set, handlers };
}

export function GridLines({
  xRange,
  values,
  y,
}: {
  xRange: [number, number];
  values: number[];
  y: Scale;
}) {
  return (
    <g aria-hidden="true">
      {values.map((v) => (
        <line
          key={v}
          x1={xRange[0]}
          x2={xRange[1]}
          y1={y(v)}
          y2={y(v)}
          stroke="var(--grid)"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
}

export function YAxis({
  x,
  values,
  y,
  format,
}: {
  x: number;
  values: number[];
  y: Scale;
  format: (v: number) => string;
}) {
  return (
    <g aria-hidden="true">
      {values.map((v) => (
        <text
          key={v}
          x={x}
          y={y(v)}
          dy="0.32em"
          textAnchor="end"
          className="tnum"
          fontSize={10.5}
          fill="var(--text-muted)"
        >
          {format(v)}
        </text>
      ))}
    </g>
  );
}

export function XAxis({
  y,
  xRange,
  labels,
}: {
  y: number;
  xRange: [number, number];
  labels: { px: number; text: string }[];
}) {
  return (
    <g aria-hidden="true">
      <line
        x1={xRange[0]}
        x2={xRange[1]}
        y1={y}
        y2={y}
        stroke="var(--axis)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {labels.map((l, i) => (
        <text
          key={`${l.text}-${i}`}
          x={l.px}
          y={y + 15}
          textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
          className="tnum"
          fontSize={10.5}
          fill="var(--text-muted)"
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}

export function path(xs: number[], ys: number[]): string {
  let d = "";
  let open = false;
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(ys[i])) {
      open = false;
      continue;
    }
    d += `${open ? "L" : "M"}${xs[i].toFixed(2)},${ys[i].toFixed(2)}`;
    open = true;
  }
  return d;
}

export function Tooltip({
  x,
  y,
  width,
  plotWidth,
  children,
}: {
  x: number;
  y: number;
  width: number;
  plotWidth: number;
  children: React.ReactNode;
}) {
  const flip = x + width + 14 > plotWidth;
  return (
    <foreignObject
      x={flip ? x - width - 12 : x + 12}
      y={Math.max(2, y)}
      width={width}
      height={200}
      style={{ overflow: "visible", pointerEvents: "none" }}
    >
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          padding: "7px 9px",
          fontSize: 11.5,
          lineHeight: 1.5,
          color: "var(--text-primary)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
          width: "fit-content",
          minWidth: width - 20,
        }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

export const fmt = {
  price(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    const dp = a >= 1000 ? 2 : a >= 100 ? 2 : a >= 1 ? 4 : 6;
    return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  },
  /**
   * Guards non-finite and missing input. Infinity and NaN both serialise to
   * null through JSON, so any number crossing the API boundary can arrive as
   * null however carefully the server computed it.
   */
  num(v: number | null | undefined, dp = 2): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  },
  signed(v: number | null | undefined, dp = 2): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    return `${v > 0 ? "+" : ""}${fmt.num(v, dp)}`;
  },
  bps(v: number | null | undefined): string {
    return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${Math.round(v)} bps`;
  },
  dateShort(t: number, intraday: boolean): string {
    const d = new Date(t * 1000);
    return intraday
      ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  },
  axisDate(t: number, intraday: boolean): string {
    const d = new Date(t * 1000);
    return intraday
      ? d.toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  },
};
