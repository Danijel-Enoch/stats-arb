"use client";

import { useMemo, useState } from "react";
import { fmt } from "./chart-kit";
import type { ScanResponse } from "@/lib/client-types";
import type { PairStat } from "@/lib/types";

type SortKey = "score" | "corr" | "z" | "halfLife" | "net" | "adf";

const COLUMNS: { key: SortKey | null; label: string; title: string }[] = [
  { key: null, label: "Pair", title: "Leg A / leg B. Hedge ratio β applies to leg B." },
  { key: "score", label: "Score", title: "Composite of the six columns to its right" },
  { key: "corr", label: "r", title: "Pearson correlation of log returns over the window" },
  { key: null, label: "Stable", title: "Correlation on the first half vs the second half of the window" },
  { key: null, label: "β", title: "OLS hedge ratio: units of leg B per unit of leg A" },
  { key: "adf", label: "ADF t", title: "Dickey-Fuller t on the spread. Below −2.86 is stationary at 5%" },
  { key: null, label: "H", title: "Hurst exponent of the spread. Below 0.5 mean-reverts" },
  { key: "halfLife", label: "Half-life", title: "Bars for half of a dislocation to decay" },
  { key: "z", label: "z now", title: "Current spread dislocation in standard deviations" },
  { key: null, label: "Edge", title: "Distance back to the mean, in bps of notional" },
  { key: null, label: "Cost", title: "Round-trip perp cost of both legs on the cheapest venue" },
  { key: "net", label: "Net", title: "Edge minus cost" },
  { key: null, label: "Perps", title: "Venues where each leg is listed as a perp" },
];

export default function ScannerTable({
  scan,
  selected,
  onSelect,
  stale,
}: {
  scan: ScanResponse;
  selected: { a: string; b: string };
  onSelect: (a: string, b: string) => void;
  stale?: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("score");
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const watch = useMemo(() => new Set(scan.watchlist), [scan.watchlist]);

  const pairs = useMemo(() => {
    const base = watchlistOnly
      ? scan.pairs.filter((p) => watch.has(`${p.a}|${p.b}`) || watch.has(`${p.b}|${p.a}`))
      : scan.pairs;
    const val = (p: PairStat) => {
      switch (sort) {
        case "corr":
          return Math.abs(p.corr);
        case "z":
          return Math.abs(p.zRolling);
        case "halfLife":
          return p.halfLifeBars === null ? -1 : -p.halfLifeBars;
        case "net":
          return p.netBps ?? -1e9;
        case "adf":
          return -p.adfT;
        default:
          return p.score;
      }
    };
    return [...base].sort((x, y) => val(y) - val(x));
  }, [scan.pairs, sort, watch, watchlistOnly]);

  return (
    <section className="card flex min-h-0 flex-1 flex-col p-4" aria-labelledby="scanner-title">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="scanner-title" className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
            Candidate pairs
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            {scan.pairsReturned} of {scan.pairsTested.toLocaleString()} tested · {scan.instrumentsLive} instruments
            live · {scan.tfLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chip"
            aria-pressed={watchlistOnly}
            onClick={() => setWatchlistOnly((v) => !v)}
            title="Only the classic relative-value pairs"
          >
            Known pairs
          </button>
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="inp h-7 w-auto text-[12px]"
            >
              <option value="score">Score</option>
              <option value="corr">Correlation</option>
              <option value="adf">Stationarity</option>
              <option value="halfLife">Fastest reversion</option>
              <option value="z">Dislocation now</option>
              <option value="net">Net edge</option>
            </select>
          </label>
        </div>
      </header>

      <div className={`scroll-x min-h-0 flex-1 overflow-y-auto ${stale ? "stale" : ""}`}>
        <table className="grid-table dense">
          <caption className="sr-only">
            Candidate pairs ranked by composite score, with correlation, stationarity, half-life, current
            dislocation and net edge after perp costs
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" title={c.title}>
                  {c.key ? (
                    <button
                      type="button"
                      onClick={() => setSort(c.key!)}
                      className="uppercase tracking-[0.04em]"
                      style={{ color: sort === c.key ? "var(--text-primary)" : "inherit" }}
                    >
                      {c.label}
                      {sort === c.key ? " ↓" : ""}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const isSel = p.a === selected.a && p.b === selected.b;
              return (
                <tr
                  key={`${p.a}|${p.b}`}
                  aria-selected={isSel}
                  tabIndex={0}
                  onClick={() => onSelect(p.a, p.b)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(p.a, p.b);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <span className="font-medium text-[var(--text-primary)]">
                      {p.a} <span className="text-[var(--text-muted)]">/</span> {p.b}
                    </span>
                    {(watch.has(`${p.a}|${p.b}`) || watch.has(`${p.b}|${p.a}`)) && (
                      <span className="ml-1.5 text-[10px] text-[var(--text-muted)]" title="A classic RV pair">
                        ★
                      </span>
                    )}
                  </td>
                  <td className="tnum font-medium text-[var(--text-primary)]">{p.score}</td>
                  <td className="tnum">{fmt.signed(p.corr)}</td>
                  <td className="tnum" title={`first half ${fmt.num(p.corrFirstHalf, 2)} · second half ${fmt.num(p.corrSecondHalf, 2)}`}>
                    {fmt.num(p.corrFirstHalf, 2)}/{fmt.num(p.corrSecondHalf, 2)}
                  </td>
                  <td className="tnum">{fmt.num(p.beta, 2)}</td>
                  <td className="tnum">
                    {fmt.num(p.adfT, 2)}
                    <span
                      className="ml-1"
                      style={{ color: p.stationary ? "var(--good-text)" : "var(--text-muted)" }}
                      title={p.stationary ? "Stationary at 5%" : "Not stationary at 5%"}
                    >
                      {p.stationary ? "✓" : "·"}
                    </span>
                  </td>
                  <td className="tnum">{fmt.num(p.hurst, 2)}</td>
                  <td className="tnum">
                    {p.halfLifeBars === null ? "—" : `${fmt.num(p.halfLifeBars, 0)}b`}
                  </td>
                  <td
                    className="tnum font-medium"
                    style={{
                      color:
                        Math.abs(p.zRolling) >= 2
                          ? p.zRolling > 0
                            ? "var(--div-pos)"
                            : "var(--div-neg)"
                          : "var(--text-secondary)",
                    }}
                  >
                    {fmt.signed(p.zRolling)}σ
                  </td>
                  <td className="tnum">{fmt.bps(p.edgeBps)}</td>
                  <td className="tnum">{fmt.bps(p.costBps)}</td>
                  <td
                    className="tnum"
                    style={{ color: (p.netBps ?? 0) > 0 ? "var(--good-text)" : "var(--text-secondary)" }}
                  >
                    {fmt.bps(p.netBps)}
                  </td>
                  <td className="text-[11px]">
                    {p.tradable ? (
                      <span title={`${p.a}: ${p.venuesA.join(", ")} · ${p.b}: ${p.venuesB.join(", ")}`}>
                        both
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]" title="At least one leg has no perp listing here">
                        {p.venuesA.length || p.venuesB.length ? "one leg" : "neither"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!pairs.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center text-[var(--text-muted)]">
                  Nothing cleared the filters. Lower the minimum correlation or add asset classes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
