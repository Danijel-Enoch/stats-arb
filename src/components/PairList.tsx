"use client";

import { useMemo, useState } from "react";
import { fmt } from "./chart-kit";
import type { ScanResponse } from "@/lib/client-types";
import type { PairStat } from "@/lib/types";
import { PairListSkeleton } from "./ui";

type SortKey = "score" | "z" | "corr" | "net" | "adf" | "halfLife";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "z", label: "Dislocation" },
  { key: "adf", label: "Stationarity" },
  { key: "halfLife", label: "Fastest reversion" },
  { key: "corr", label: "Correlation" },
  { key: "net", label: "Net edge" },
];

/**
 * The pair list is the spine of the workspace, so each row carries only what
 * decides whether to open it: who, how good, and how stretched right now. The
 * full dozen statistics live in the Stats tab once a pair is open.
 */
export default function PairList({
  scan,
  selected,
  onSelect,
  stale,
}: {
  scan: ScanResponse | null;
  selected: { a: string; b: string };
  onSelect: (a: string, b: string) => void;
  stale?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [watchOnly, setWatchOnly] = useState(false);

  const watch = useMemo(() => new Set(scan?.watchlist ?? []), [scan?.watchlist]);
  const isWatched = (p: PairStat) => watch.has(`${p.a}|${p.b}`) || watch.has(`${p.b}|${p.a}`);

  const pairs = useMemo(() => {
    if (!scan) return [];
    const q = query.trim().toUpperCase();
    let out = scan.pairs;
    if (q) out = out.filter((p) => p.a.includes(q) || p.b.includes(q));
    if (watchOnly) out = out.filter(isWatched);
    const val = (p: PairStat) => {
      switch (sort) {
        case "z":
          return Math.abs(p.zRolling);
        case "corr":
          return Math.abs(p.corr);
        case "net":
          return p.netBps ?? -1e9;
        case "adf":
          return -p.adfT;
        case "halfLife":
          return p.halfLifeBars === null ? -1 : -p.halfLifeBars;
        default:
          return p.score;
      }
    };
    return [...out].sort((x, y) => val(y) - val(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, query, sort, watchOnly, watch]);

  return (
    <aside className="flex min-h-0 flex-1 flex-col" aria-label="Candidate pairs">
      <div className="flex flex-col gap-2.5 border-b px-3 py-3 hair">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Pairs</h2>
          <span className="tnum text-[11.5px] text-[var(--text-muted)]">
            {scan ? `${pairs.length} of ${scan.pairsTested.toLocaleString()}` : "…"}
          </span>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by instrument…"
          aria-label="Filter pairs by instrument"
          className="inp h-8 text-[12.5px]"
        />

        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort pairs"
            className="inp h-7 flex-1 text-[12px]"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="chip h-7"
            aria-pressed={watchOnly}
            onClick={() => setWatchOnly((v) => !v)}
            title="Only the classic relative-value pairs"
          >
            ★
          </button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${stale ? "stale" : ""}`}>
        {!scan && <PairListSkeleton />}
        {scan && !pairs.length && (
          <p className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            Nothing matches. Clear the filter, or widen the scan.
          </p>
        )}
        <ul role="listbox" aria-label="Candidate pairs">
          {pairs.map((p) => {
            const isSel = p.a === selected.a && p.b === selected.b;
            return (
              <li key={`${p.a}|${p.b}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => onSelect(p.a, p.b)}
                  title={`r ${fmt.signed(p.corr)} · ADF ${fmt.num(p.adfT, 2)} · half-life ${
                    p.halfLifeBars === null ? "none" : `${fmt.num(p.halfLifeBars, 0)} bars`
                  } · ${p.tradable ? "both legs perp-listed" : "not fully perp-listed"}`}
                  className="w-full border-b px-3 py-2 text-left transition-colors hair"
                  style={{
                    background: isSel ? "var(--series-1-wash)" : "transparent",
                    boxShadow: isSel ? "inset 2px 0 0 var(--series-1)" : undefined,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">
                      {p.a} <span className="text-[var(--text-muted)]">/</span> {p.b}
                      {isWatched(p) && (
                        <span className="ml-1 text-[10px] text-[var(--text-muted)]" title="A classic RV pair">
                          ★
                        </span>
                      )}
                    </span>
                    <ScoreBadge score={p.score} />
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <ZTrack z={p.zRolling} />
                    <span
                      className="tnum w-[46px] shrink-0 text-right text-[11px]"
                      style={{
                        color:
                          Math.abs(p.zRolling) >= 2
                            ? p.zRolling > 0
                              ? "var(--div-pos)"
                              : "var(--div-neg)"
                            : "var(--text-muted)",
                      }}
                    >
                      {fmt.signed(p.zRolling, 1)}σ
                    </span>
                    <span
                      className="tnum w-[52px] shrink-0 text-right text-[11px]"
                      style={{
                        color:
                          p.netBps === null
                            ? "var(--text-muted)"
                            : p.netBps > 0
                              ? "var(--good-text)"
                              : "var(--text-muted)",
                      }}
                    >
                      {p.netBps === null ? "—" : `${Math.round(p.netBps)}bp`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="tnum shrink-0 rounded px-1.5 py-[1px] text-[11px] font-medium"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        color: score >= 65 ? "var(--text-primary)" : "var(--text-muted)",
      }}
      title="Composite score, 0–100"
    >
      {score}
    </span>
  );
}

/** Where the spread sits on a ±3σ track, with the ±2σ triggers marked. */
function ZTrack({ z }: { z: number }) {
  const clamped = Math.max(-3, Math.min(3, z));
  const pct = ((clamped + 3) / 6) * 100;
  const hot = Math.abs(z) >= 2;
  return (
    <span
      className="relative block h-[6px] flex-1 rounded-full"
      style={{ background: "var(--surface-3)" }}
      aria-hidden="true"
    >
      {[-2, 2].map((t) => (
        <span
          key={t}
          className="absolute top-0 h-full w-px"
          style={{ left: `${((t + 3) / 6) * 100}%`, background: "var(--border-strong)" }}
        />
      ))}
      <span className="absolute top-0 h-full w-px" style={{ left: "50%", background: "var(--axis)" }} />
      <span
        className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${pct}%`,
          background: hot ? (z > 0 ? "var(--div-pos)" : "var(--div-neg)") : "var(--text-muted)",
          border: "2px solid var(--surface-1)",
        }}
      />
    </span>
  );
}
