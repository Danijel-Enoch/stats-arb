"use client";

import { fmt } from "./chart-kit";
import type { PairResponse } from "@/lib/client-types";

/**
 * One number each, with its own label — a stat tile, not a one-bar bar chart.
 * Values keep proportional figures; only the tables use tabular-nums.
 */
export default function StatTiles({ data }: { data: PairResponse }) {
  const s = data.stat;
  if (!s) return null;

  const tiles: { label: string; value: string; note?: string; tone?: string }[] = [
    {
      label: "Correlation",
      value: fmt.signed(s.corr),
      note: `rank ${fmt.signed(s.rankCorr)} · halves ${fmt.num(s.corrFirstHalf, 2)}/${fmt.num(s.corrSecondHalf, 2)}`,
    },
    {
      label: "Hedge ratio β",
      value: fmt.num(s.beta, 3),
      note: `R² ${fmt.num(s.r2, 2)} · ${fmt.num(Math.abs(s.beta), 2)} of ${data.b.id} per ${data.a.id}`,
    },
    {
      label: "Dislocation",
      value: `${fmt.signed(s.zRolling)}σ`,
      note: `${fmt.bps(s.edgeBps)} back to the mean`,
      tone:
        Math.abs(s.zRolling) >= 2
          ? s.zRolling > 0
            ? "var(--div-pos)"
            : "var(--div-neg)"
          : undefined,
    },
    {
      label: "Half-life",
      value: s.halfLifeBars === null ? "—" : `${fmt.num(s.halfLifeBars, 0)} bars`,
      note:
        s.halfLifeHours === null
          ? "spread does not mean-revert"
          : s.halfLifeHours >= 48
            ? `≈ ${fmt.num(s.halfLifeHours / 24, 1)} days`
            : `≈ ${fmt.num(s.halfLifeHours, 1)} hours`,
    },
    {
      label: "Stationarity",
      value: fmt.num(s.adfT, 2),
      note: s.stationary ? "ADF t < −2.86 · cointegrated at 5%" : "above the 5% threshold — treat as drifting",
      tone: s.stationary ? "var(--good-text)" : undefined,
    },
    {
      label: "Net edge",
      value: fmt.bps(s.netBps),
      note:
        s.costBps === null
          ? "one leg has no perp listing"
          : `${fmt.bps(s.edgeBps)} edge − ${fmt.bps(s.costBps)} cost`,
      tone: (s.netBps ?? 0) > 0 ? "var(--good-text)" : undefined,
    },
  ];

  return (
    <div className="anim-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="card flex flex-col px-4 py-3.5">
          <div className="text-[12.5px] text-[var(--text-muted)]">{t.label}</div>
          <div
            className="mt-1.5 text-[26px] leading-none font-semibold tracking-[-0.03em]"
            style={{ color: t.tone ?? "var(--text-primary)" }}
          >
            {t.value}
          </div>
          {t.note && (
            <div className="mt-2 text-[11.5px] leading-snug text-[var(--text-muted)]">{t.note}</div>
          )}
        </div>
      ))}
    </div>
  );
}
