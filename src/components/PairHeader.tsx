"use client";

import { fmt } from "./chart-kit";
import type { PairResponse } from "@/lib/client-types";

/**
 * The answer, stated before any of the evidence. Everything below this on the
 * page is the working; this is the conclusion.
 */
export default function PairHeader({ data, starred }: { data: PairResponse; starred: boolean }) {
  const s = data.stat;
  const z = s?.zRolling ?? 0;
  const hot = Math.abs(z) >= 2;

  const verdict = !s
    ? null
    : z >= 2
      ? {
          head: `Short ${data.a.id}, long ${data.b.id}`,
          tone: "var(--div-pos)",
          why: `${data.a.id} is rich against ${data.b.id} by ${fmt.num(Math.abs(z), 1)}σ.`,
        }
      : z <= -2
        ? {
            head: `Long ${data.a.id}, short ${data.b.id}`,
            tone: "var(--div-neg)",
            why: `${data.a.id} is cheap against ${data.b.id} by ${fmt.num(Math.abs(z), 1)}σ.`,
          }
        : {
            head: "No entry",
            tone: "var(--text-muted)",
            why: `The spread is ${fmt.num(Math.abs(z), 1)}σ from its mean — inside the ±2σ band.`,
          };

  return (
    <div className="border-b px-5 py-4 hair">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[19px] leading-tight font-semibold tracking-[-0.025em]">
            <span className="text-[var(--text-primary)]">{data.a.id}</span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-[var(--text-primary)]">{data.b.id}</span>
            {starred && (
              <span className="text-[13px] text-[var(--text-muted)]" title="A classic relative-value pair">
                ★
              </span>
            )}
          </h1>
          <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
            {data.a.name} vs {data.b.name} · {data.tfLabel} · {data.t.length} overlapping bars ·{" "}
            <span title="Which provider served each leg">
              {data.a.proxiedBy ? `${data.a.id} via ${data.a.proxiedBy}` : data.a.source}
              {", "}
              {data.b.proxiedBy ? `${data.b.id} via ${data.b.proxiedBy}` : data.b.source}
            </span>
          </p>
        </div>

        {s && (
          <div className="flex items-center gap-5">
            <Figure label="Score" value={String(s.score)} />
            <Figure label="Correlation" value={fmt.signed(s.corr)} />
            <Figure
              label="Dislocation"
              value={`${fmt.signed(z)}σ`}
              tone={hot ? (z > 0 ? "var(--div-pos)" : "var(--div-neg)") : undefined}
            />
            <Figure
              label="Net edge"
              value={fmt.bps(s.netBps)}
              tone={(s.netBps ?? 0) > 0 ? "var(--good-text)" : undefined}
            />
          </div>
        )}
      </div>

      {verdict && s && (
        <div
          className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-3.5 py-2.5 hair"
          style={{ background: "var(--surface-2)" }}
          role="status"
        >
          <span aria-hidden="true" style={{ color: verdict.tone }}>
            {hot ? "◆" : "○"}
          </span>
          <span className="text-[13.5px] font-medium" style={{ color: verdict.tone }}>
            {verdict.head}
          </span>
          <span className="text-[12.5px] text-[var(--text-secondary)]">{verdict.why}</span>
          <span className="ml-auto text-[12.5px] text-[var(--text-muted)]">
            {s.costBps === null ? (
              "One leg is not perp-listed — no cost estimate"
            ) : (
              <>
                <span className="tnum text-[var(--text-secondary)]">{fmt.bps(s.edgeBps)}</span> back to the mean −{" "}
                <span className="tnum text-[var(--text-secondary)]">{fmt.bps(s.costBps)}</span> round trip ={" "}
                <span
                  className="tnum font-medium"
                  style={{ color: (s.netBps ?? 0) > 0 ? "var(--good-text)" : "var(--text-primary)" }}
                >
                  {fmt.bps(s.netBps)}
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="text-right">
      <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
      <div
        className="mt-0.5 text-[18px] leading-none font-semibold tracking-[-0.02em]"
        style={{ color: tone ?? "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
