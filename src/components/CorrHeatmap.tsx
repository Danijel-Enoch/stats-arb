"use client";

import { useState } from "react";
import { fmt } from "./chart-kit";
import type { ScanResponse } from "@/lib/client-types";

/**
 * Correlation is polarity data, so the ramp is diverging — blue for negative,
 * red for positive, a neutral gray at zero. Never a rainbow, and never a hue
 * at the midpoint, where the value means "no relationship".
 */
function cellColor(r: number): { bg: string; ink: string } {
  const a = Math.abs(r);
  const band = a >= 0.85 ? 3 : a >= 0.7 ? 2 : a >= 0.45 ? 1 : 0;
  if (band === 0) return { bg: "var(--div-mid)", ink: "var(--text-muted)" };
  const side = r > 0 ? "pos" : "neg";
  const step = band === 3 ? "-strong" : band === 2 ? "" : "-soft";
  return {
    bg: `var(--div-${side}${step})`,
    ink: band >= 2 ? "var(--surface-1)" : "var(--text-primary)",
  };
}

export default function CorrHeatmap({
  scan,
  onPick,
  stale,
}: {
  scan: ScanResponse;
  onPick: (a: string, b: string) => void;
  stale?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  const { ids, rows } = scan.matrix;
  if (!ids.length) return null;

  return (
    <section aria-labelledby="heatmap-title">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="heatmap-title" className="sr-only">
            Correlation of log returns
          </h2>
          <p className="text-[12.5px] text-[var(--text-muted)]">
            Top-ranked instruments · {scan.matrix.bars} bars every one of them shares · click a cell to load the pair
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScaleLegend />
          <button type="button" className="chip" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            Table
          </button>
        </div>
      </header>

      <div className={`scroll-x ${stale ? "stale" : ""}`}>
        <table className="tnum" style={{ borderCollapse: "separate", borderSpacing: "2px" }}>
          <caption className="sr-only">
            Pearson correlation of log returns between each pair of top-ranked instruments
          </caption>
          <thead>
            <tr>
              <th />
              {ids.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className="px-1 pb-1 text-[10px] font-medium text-[var(--text-muted)]"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: 54 }}
                >
                  {id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((rowId, r) => (
              <tr key={rowId}>
                <th
                  scope="row"
                  className="pr-2 text-right text-[10.5px] font-medium whitespace-nowrap text-[var(--text-secondary)]"
                >
                  {rowId}
                </th>
                {ids.map((colId, c) => {
                  const v = rows[r]?.[c] ?? 0;
                  const self = r === c;
                  const { bg, ink } = self ? { bg: "var(--surface-2)", ink: "var(--text-muted)" } : cellColor(v);
                  return (
                    <td key={colId} style={{ padding: 1 }}>
                      <button
                        type="button"
                        disabled={self}
                        onClick={() => onPick(rowId, colId)}
                        title={`${rowId} vs ${colId}: r = ${fmt.num(v, 3)}`}
                        aria-label={`${rowId} versus ${colId}, correlation ${fmt.num(v, 2)}`}
                        style={{
                          background: bg,
                          color: ink,
                          width: 44,
                          height: 26,
                          borderRadius: 3,
                          fontSize: 10.5,
                          cursor: self ? "default" : "pointer",
                          display: "block",
                        }}
                      >
                        {self ? "—" : fmt.num(v, 2).replace("0.", ".")}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showTable && (
        <div className="scroll-x mt-3 max-h-72 overflow-y-auto border-t pt-2 hair">
          <table className="grid-table tnum">
            <caption className="sr-only">The same correlations as rows</caption>
            <thead>
              <tr>
                <th scope="col">Pair</th>
                <th scope="col">Correlation</th>
              </tr>
            </thead>
            <tbody>
              {ids.flatMap((rowId, r) =>
                ids.slice(r + 1).map((colId, k) => (
                  <tr key={`${rowId}-${colId}`}>
                    <td>
                      {rowId} / {colId}
                    </td>
                    <td>{fmt.signed(rows[r]?.[r + 1 + k] ?? 0)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ScaleLegend() {
  const stops: { bg: string; label: string }[] = [
    { bg: "var(--div-neg-strong)", label: "−1" },
    { bg: "var(--div-neg)", label: "" },
    { bg: "var(--div-neg-soft)", label: "" },
    { bg: "var(--div-mid)", label: "0" },
    { bg: "var(--div-pos-soft)", label: "" },
    { bg: "var(--div-pos)", label: "" },
    { bg: "var(--div-pos-strong)", label: "+1" },
  ];
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {stops.map((s, i) => (
        <span key={i} className="flex flex-col items-center gap-0.5">
          <span style={{ background: s.bg, width: 16, height: 10, borderRadius: 2, display: "block" }} />
          <span className="text-[9px] text-[var(--text-muted)]">{s.label}</span>
        </span>
      ))}
    </div>
  );
}
