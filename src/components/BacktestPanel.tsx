"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { BacktestResponse, BacktestForm } from "@/lib/client-types";
import { Spinner } from "./ui";

const PAD = { top: 16, right: 18, bottom: 26, left: 62 };
const HEIGHT = 230;

export const BLANK_FORM: BacktestForm = {
  entryZ: 2,
  exitZ: 0.5,
  stopZ: 4,
  lookback: 90,
  maxBars: "",
  capital: 10000,
  leverage: 1,
  maintenanceMarginPct: "",
  feeBpsA: "",
  feeBpsB: "",
  fundingBpsPerDay: "",
  slippageBps: 2,
  side: "both",
  from: "",
  to: "",
};

export default function BacktestPanel({
  a,
  b,
  tf,
  onTrades,
}: {
  a: string;
  b: string;
  tf: string;
  onTrades: (trades: BacktestResponse["trades"] | null) => void;
}) {
  const [form, setForm] = useState<BacktestForm>(BLANK_FORM);
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(
    async (f: BacktestForm) => {
      const mine = ++seq.current;
      setRunning(true);
      setError(null);
      const qs = new URLSearchParams({ a, b, tf });
      for (const [k, v] of Object.entries(f)) {
        if (v === "" || v === null || v === undefined) continue;
        qs.set(k, k === "from" || k === "to" ? String(toUnix(String(v))) : String(v));
      }
      try {
        const r = await fetch(`/api/backtest?${qs}`);
        const j: BacktestResponse = await r.json();
        if (mine !== seq.current) return;
        if (j.error) {
          setError(j.error);
          setResult(null);
          onTrades(null);
          return;
        }
        setResult(j);
        onTrades(j.trades);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === seq.current) setRunning(false);
      }
    },
    [a, b, onTrades, tf],
  );

  // Re-run whenever the pair or bar size changes; parameter edits are manual.
  // Synchronizing with the backtest API is what this effect is for, and the
  // running flag is part of that — see the note in Dashboard.tsx.
  useEffect(() => {
    // The form is read, not depended on: editing a parameter should not fire a
    // run, only the Run button or a new pair should.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, tf]);

  const set = <K extends keyof BacktestForm>(k: K, v: BacktestForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <section aria-labelledby="bt-title">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="bt-title" className="sr-only">
            Backtest of {a} / {b}
          </h2>
          <p className="max-w-4xl text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            Walk-forward: β, mean and σ are refit from the prior {result?.params.lookback ?? form.lookback} bars
            at every step, and an open position keeps the β it was entered with. Fees, funding and slippage are
            charged on both legs.
          </p>
        </div>
      </header>

      <Controls
        form={form}
        set={set}
        result={result}
        onSubmit={() => void run(form)}
        running={running}
        onReset={() => {
          setForm(BLANK_FORM);
          void run(BLANK_FORM);
        }}
      />

      {error && (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--critical)" }} role="status">
          ⚠ {error}
        </p>
      )}

      {result && (
        <>
          {result.defaults.leverageClamped !== null && (
            <p className="mt-2 text-[12px] text-[var(--text-muted)]" role="status">
              <strong style={{ color: "var(--warning)" }}>Leverage capped. </strong>
              {fmt.num(result.defaults.leverageClamped, 0)}× was requested, but the more restrictive leg
              allows {fmt.num(result.defaults.maxLeverage ?? 0, 0)}×, so the run used that.
            </p>
          )}
          {result.summary.liquidations > 0 && (
            <p className="mt-2 text-[12px] leading-relaxed" role="status">
              <strong style={{ color: "var(--critical)" }}>
                {result.summary.liquidations} of {result.summary.trades} trades were liquidated.{" "}
              </strong>
              <span className="text-[var(--text-secondary)]">
                At {fmt.num(result.params.leverage, 0)}× the margin runs out before the {result.params.stopZ}σ
                stop is reached, so the venue closes the position and the whole margin is lost. A spread that
                mean-reverts on paper can still wipe you out on the way there.
              </span>
            </p>
          )}
          {result.notes.length > 0 && (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]" role="status">
              {result.notes.join(" ")}
            </p>
          )}
          <Summary result={result} />
          {/* Stacked, not side by side: the trades table carries fifteen
              columns and needs the full pane, and the equity curve reads
              better wide than tall. */}
          <div className="mt-5 flex flex-col gap-5">
            <div className="min-w-0">
              <EquityChart result={result} />
            </div>
            <TradesTable result={result} />
          </div>
        </>
      )}
    </section>
  );
}

/* ── controls ───────────────────────────────────────────────────────────── */

function Controls({
  form,
  set,
  result,
  onSubmit,
  running,
  onReset,
}: {
  form: BacktestForm;
  set: <K extends keyof BacktestForm>(k: K, v: BacktestForm[K]) => void;
  result: BacktestResponse | null;
  onSubmit: () => void;
  running: boolean;
  onReset: () => void;
}) {
  const dataFrom = result ? isoDate(result.dataFrom) : "";
  const dataTo = result ? isoDate(result.dataTo) : "";

  return (
    <form
      className="grid gap-x-5 gap-y-3.5 rounded-[10px] border px-4 py-4 sm:grid-cols-3 lg:grid-cols-6 hair"
      style={{ background: "var(--surface-2)" }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Field label="From" hint={dataFrom ? `data starts ${dataFrom}` : undefined}>
        <input
          type="date"
          value={form.from}
          min={dataFrom}
          max={dataTo}
          onChange={(e) => set("from", e.target.value)}
          className="inp"
        />
      </Field>
      <Field label="To" hint={dataTo ? `data ends ${dataTo}` : undefined}>
        <input
          type="date"
          value={form.to}
          min={dataFrom}
          max={dataTo}
          onChange={(e) => set("to", e.target.value)}
          className="inp"
        />
      </Field>
      <Field
        label="Trade size"
        hint={
          result && result.params.leverage > 1
            ? `notional on leg A; ≈${money(result.summary.avgMargin)} margin at ${fmt.num(
                result.params.leverage,
                0,
              )}×`
            : "notional on leg A; leg B is β× this"
        }
      >
        <input
          type="number"
          min={1}
          step="any"
          value={form.capital}
          onChange={(e) => set("capital", Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field
        label="Leverage"
        hint={
          result?.defaults.maxLeverage
            ? `venue cap ${fmt.num(result.defaults.maxLeverage, 0)}× — ${result.a.id} ${fmt.num(
                result.defaults.maxLeverageA,
                0,
              )}×, ${result.b.id} ${fmt.num(result.defaults.maxLeverageB, 0)}×`
            : result
              ? `${
                  result.defaults.maxLeverageA === null ? result.a.id : result.b.id
                } has no perp listing — uncapped, and not executable as a pair`
              : "uncapped"
        }
      >
        <input
          type="number"
          min={1}
          max={result?.defaults.maxLeverage ?? 200}
          step="any"
          value={form.leverage}
          onChange={(e) => set("leverage", Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field
        label="Maint. margin %"
        hint="liquidated when equity falls to this share of notional"
      >
        <input
          type="number"
          min={0}
          max={50}
          step="any"
          value={form.maintenanceMarginPct}
          placeholder="0.5"
          onChange={(e) =>
            set("maintenanceMarginPct", e.target.value === "" ? "" : Number(e.target.value))
          }
          className="inp"
        />
      </Field>
      <Field label="Entry |z|" hint="open when the spread is this stretched">
        <input
          type="number"
          min={0.5}
          max={6}
          step="any"
          value={form.entryZ}
          onChange={(e) => set("entryZ", Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field label="Exit |z|" hint="take profit at this distance from the mean">
        <input
          type="number"
          min={0}
          max={3}
          step="any"
          value={form.exitZ}
          onChange={(e) => set("exitZ", Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field label="Stop |z|" hint="cut when the spread keeps widening">
        <input
          type="number"
          min={1}
          max={12}
          step="any"
          value={form.stopZ}
          onChange={(e) => set("stopZ", Number(e.target.value))}
          className="inp"
        />
      </Field>

      <Field label="Fit lookback" hint="bars used to refit β, mean and σ">
        <input
          type="number"
          min={20}
          max={500}
          step="any"
          value={form.lookback}
          onChange={(e) => set("lookback", Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field
        label="Max hold (bars)"
        hint={result?.defaults.maxBars ? `blank = ${result.defaults.maxBars} (4× half-life)` : "blank = no time stop"}
      >
        <input
          type="number"
          min={0}
          step="any"
          value={form.maxBars}
          placeholder={String(result?.defaults.maxBars ?? 0)}
          onChange={(e) => set("maxBars", e.target.value === "" ? "" : Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field
        label={`Fee ${result?.a.id ?? "A"} (bps)`}
        hint={result?.defaults.feeBpsA !== null && result ? `venue: ${fmt.num(result.defaults.feeBpsA!, 1)}` : "no venue listing"}
      >
        <input
          type="number"
          min={0}
          step="any"
          value={form.feeBpsA}
          placeholder={result?.defaults.feeBpsA !== null && result ? String(result.defaults.feeBpsA) : "10"}
          onChange={(e) => set("feeBpsA", e.target.value === "" ? "" : Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field
        label={`Fee ${result?.b.id ?? "B"} (bps)`}
        hint={result?.defaults.feeBpsB !== null && result ? `venue: ${fmt.num(result.defaults.feeBpsB!, 1)}` : "no venue listing"}
      >
        <input
          type="number"
          min={0}
          step="any"
          value={form.feeBpsB}
          placeholder={result?.defaults.feeBpsB !== null && result ? String(result.defaults.feeBpsB) : "10"}
          onChange={(e) => set("feeBpsB", e.target.value === "" ? "" : Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field
        label="Funding (bps/day)"
        hint={
          result?.defaults.fundingBpsPerDay != null
            ? `venue: ${fmt.num(result.defaults.fundingBpsPerDay, 2)}`
            : "no venue rate — assumed"
        }
      >
        <input
          type="number"
          step="any"
          value={form.fundingBpsPerDay}
          placeholder={
            result?.defaults.fundingBpsPerDay != null ? fmt.num(result.defaults.fundingBpsPerDay, 2) : "1"
          }
          onChange={(e) => set("fundingBpsPerDay", e.target.value === "" ? "" : Number(e.target.value))}
          className="inp"
        />
      </Field>
      <Field label="Slippage (bps)" hint="charged on both legs, per round trip">
        <input
          type="number"
          min={0}
          step="any"
          value={form.slippageBps}
          onChange={(e) => set("slippageBps", Number(e.target.value))}
          className="inp"
        />
      </Field>

      <Field label="Direction" hint="which side of the spread to take">
        <select value={form.side} onChange={(e) => set("side", e.target.value as BacktestForm["side"])} className="inp">
          <option value="both">Both sides</option>
          <option value="long">Long spread only</option>
          <option value="short">Short spread only</option>
        </select>
      </Field>

      {/* Actions sit after the fields, where you land having edited one. */}
      <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-5">
        <button type="button" className="chip h-8" onClick={onReset}>
          Reset
        </button>
        <button type="submit" disabled={running} className="btn btn-primary gap-2">
          {running && <Spinner size={13} />}
          {running ? "Running…" : "Run backtest"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] tracking-[0.02em] text-[var(--text-muted)] uppercase">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-tight text-[var(--text-muted)]">{hint}</span>}
    </label>
  );
}

/* ── summary ────────────────────────────────────────────────────────────── */

function Summary({ result }: { result: BacktestResponse }) {
  const s = result.summary;
  const money = (v: number) => `${v < 0 ? "−" : ""}$${fmt.num(Math.abs(v), 0)}`;
  const tiles: { label: string; value: string; note: string; tone?: string }[] = [
    {
      label: "Net P&L",
      value: money(s.netPnl),
      note:
        result.params.leverage > 1
          ? `${fmt.signed(s.returnOnMarginPct)}% on ${money(s.avgMargin)} margin at ${fmt.num(
              result.params.leverage,
              0,
            )}×`
          : `${fmt.signed(s.returnOnCapitalPct)}% on ${money(result.params.capital)} per trade`,
      tone: s.netPnl > 0 ? "var(--good-text)" : s.netPnl < 0 ? "var(--critical)" : undefined,
    },
    {
      label: "Trades",
      value: String(s.trades),
      note: `${s.wins}W / ${s.losses}L · ${fmt.num(s.winRate, 0)}% win rate`,
    },
    {
      label: "Profit factor",
      // null = no losing trades, so there is nothing to divide by.
      value: s.profitFactor === null ? (s.wins > 0 ? "∞" : "—") : fmt.num(s.profitFactor, 2),
      note:
        s.profitFactor === null && s.wins > 0
          ? `${s.wins} wins, no losses · avg win ${money(s.avgWin)}`
          : `avg win ${money(s.avgWin)} · avg loss ${money(s.avgLoss)}`,
      tone:
        s.profitFactor === null
          ? s.wins > 0
            ? "var(--good-text)"
            : undefined
          : s.profitFactor >= 1
            ? "var(--good-text)"
            : "var(--critical)",
    },
    {
      label: "Max drawdown",
      value: money(-s.maxDrawdown),
      // Trades are sequential, so this accumulates across them — it is the
      // buffer you would have needed, not a single trade's loss.
      note: `cumulative · ${fmt.num(s.maxDrawdownPct / 100, 2)}× the margin per trade`,
      tone: s.maxDrawdown > 0 ? "var(--critical)" : undefined,
    },
    {
      label: "Costs paid",
      value: money(-(s.fees + s.funding + s.slippage)),
      note: `${money(s.fees)} fees · ${money(s.funding)} funding · ${money(s.slippage)} slip`,
    },
    {
      label: "Avg hold",
      value: `${fmt.num(s.avgBarsHeld, 1)} bars`,
      note: `${fmt.num(s.avgDaysHeld, 1)} days · in the market ${fmt.num(s.exposurePct, 0)}% of the time`,
    },
    {
      label: "Sharpe",
      value: fmt.num(s.sharpe, 2),
      note: `annualised from ${s.trades} trades over ${result.barsTested} bars`,
    },
    {
      label: s.liquidations > 0 ? "Liquidations" : "Exits",
      value: s.liquidations > 0 ? `${s.liquidations}/${s.trades}` : `${s.exits.target}/${s.trades}`,
      note:
        s.liquidations > 0
          ? `margin wiped out ${s.liquidations}× · ${s.exits.target} target · ${s.exits.stop} stop`
          : `${s.exits.target} target · ${s.exits.stop} stop · ${s.exits.time} time · ${s.exits["end of data"]} open at end`,
      tone: s.liquidations > 0 ? "var(--critical)" : undefined,
    },
  ];

  return (
    <div className="anim-stagger mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col rounded-[10px] border px-3.5 py-3 hair">
          <div className="text-[12px] text-[var(--text-muted)]">{t.label}</div>
          <div
            className="mt-1.5 text-[21px] leading-none font-semibold tracking-[-0.025em]"
            style={{ color: t.tone ?? "var(--text-primary)" }}
          >
            {t.value}
          </div>
          <div className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">{t.note}</div>
        </div>
      ))}
    </div>
  );
}

/* ── equity curve ───────────────────────────────────────────────────────── */

function EquityChart({ result }: { result: BacktestResponse }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [showTable, setShowTable] = useState(false);
  const eq = result.equity;
  const intraday = result.barSeconds < 86_400;

  const geom = useMemo(() => {
    const n = Math.max(1, eq.length - 1);
    const x = linear([0, n], [PAD.left, Math.max(PAD.left + 10, width - PAD.right)]);
    const yDomain = nicePadded([0, ...eq.map((e) => e.equity), ...eq.map((e) => e.realised)]);
    const y = linear(yDomain, [HEIGHT - PAD.bottom, PAD.top]);
    const xs = eq.map((_, i) => x(i));
    return {
      x,
      y,
      xs,
      yTicks: ticks(yDomain, 5),
      dEquity: path(xs, eq.map((e) => y(e.equity))),
      dRealised: path(xs, eq.map((e) => y(e.realised))),
    };
  }, [eq, width]);

  const { index, handlers } = useCrosshair(eq.length, geom.x);

  const xLabels = useMemo(() => {
    const last = eq.length - 1;
    if (last < 1) return [];
    const picks = [0, Math.floor(last / 2), last].filter((v, k, arr) => arr.indexOf(v) === k);
    return picks.map((k) => ({ px: geom.x(k), text: fmt.axisDate(eq[k].t, intraday) }));
  }, [eq, geom, intraday]);

  if (!eq.length) {
    return (
      <div className="grid h-[230px] place-items-center rounded-md text-[12px] text-[var(--text-muted)]" style={{ background: "var(--surface-2)" }}>
        No bars in the selected range.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          Equity curve{" "}
          <span className="font-normal text-[var(--text-muted)]">
            — starts after the {result.params.lookback}-bar fit window
          </span>
        </h3>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--series-1)" }} />
            Mark to market
          </span>
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--series-2)" }} />
            Realised
          </span>
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <span
              style={{ width: 9, height: 9, borderRadius: 2, background: "var(--text-muted)", opacity: 0.45 }}
            />
            In a position
          </span>
          <button type="button" className="chip" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            Table
          </button>
        </div>
      </div>

      <div ref={ref}>
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          tabIndex={0}
          aria-label={`Equity curve ending at ${fmt.num(eq[eq.length - 1].equity, 0)} dollars`}
          style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
          {...handlers}
        >
          {/* Bars where a position was open. Deliberately a single neutral
              tone: the spread panel already shades by win/loss, and reusing
              that colour language here for a different meaning (side) would
              read as a contradiction. The side is in the tooltip. */}
          {eq.map((e, i) =>
            e.inTrade === 0 ? null : (
              <rect
                key={e.t}
                x={geom.x(i)}
                y={PAD.top}
                width={Math.max(1, geom.x(1) - geom.x(0) || 1)}
                height={HEIGHT - PAD.bottom - PAD.top}
                fill="var(--text-muted)"
                opacity={0.14}
              />
            ),
          )}
          <GridLines xRange={[PAD.left, width - PAD.right]} values={geom.yTicks} y={geom.y} />
          <YAxis x={PAD.left - 8} values={geom.yTicks} y={geom.y} format={(v) => `$${fmt.num(v, 0)}`} />
          <XAxis y={HEIGHT - PAD.bottom} xRange={[PAD.left, width - PAD.right]} labels={xLabels} />
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={geom.y(0)}
            y2={geom.y(0)}
            stroke="var(--axis)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <path d={geom.dRealised} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
          <path d={geom.dEquity} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />

          {index !== null && index >= 0 && index < eq.length && (
            <g>
              <line
                x1={geom.x(index)}
                x2={geom.x(index)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--axis)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <circle cx={geom.x(index)} cy={geom.y(eq[index].equity)} r={4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
              <Tooltip x={geom.x(index)} y={PAD.top} width={190} plotWidth={width}>
                <div style={{ color: "var(--text-muted)", marginBottom: 3 }}>
                  {fmt.dateShort(eq[index].t, intraday)}
                </div>
                <div className="tnum">
                  equity <strong>${fmt.num(eq[index].equity, 0)}</strong>
                </div>
                <div className="tnum" style={{ color: "var(--text-secondary)" }}>
                  realised ${fmt.num(eq[index].realised, 0)}
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  {eq[index].inTrade === 0
                    ? "flat"
                    : eq[index].inTrade === 1
                      ? `long the spread`
                      : `short the spread`}
                </div>
              </Tooltip>
            </g>
          )}
        </svg>
      </div>

      {showTable && (
        <div className="scroll-x mt-2 max-h-56 overflow-y-auto border-t pt-2 hair">
          <table className="grid-table tnum">
            <caption className="sr-only">Equity by bar</caption>
            <thead>
              <tr>
                <th scope="col">Bar</th>
                <th scope="col">Equity</th>
                <th scope="col">Realised</th>
                <th scope="col">Position</th>
              </tr>
            </thead>
            <tbody>
              {eq
                .slice()
                .reverse()
                .slice(0, 60)
                .map((e) => (
                  <tr key={e.t}>
                    <td>{fmt.dateShort(e.t, intraday)}</td>
                    <td>${fmt.num(e.equity, 0)}</td>
                    <td>${fmt.num(e.realised, 0)}</td>
                    <td>{e.inTrade === 0 ? "flat" : e.inTrade === 1 ? "long spread" : "short spread"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── trades ─────────────────────────────────────────────────────────────── */

function TradesTable({ result }: { result: BacktestResponse }) {
  const intraday = result.barSeconds < 86_400;
  const trades = result.trades;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          Trades taken{" "}
          <span className="font-normal text-[var(--text-muted)]">
            — {result.a.id} is leg A, {result.b.id} is leg B
          </span>
        </h3>
        <span className="text-[11px] text-[var(--text-muted)]">{trades.length} total</span>
      </div>
      <div className="scroll-x max-h-[320px] min-h-0 overflow-y-auto">
        <table className="grid-table dense">
          <caption className="sr-only">Every trade the backtest took, with its P&amp;L breakdown</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Side</th>
              <th scope="col">Entry</th>
              <th scope="col">Closed</th>
              <th scope="col">Bars</th>
              <th scope="col">z in</th>
              <th scope="col">z out</th>
              <th scope="col">β</th>
              <th scope="col">Gross</th>
              <th scope="col">Fees</th>
              <th scope="col">Funding</th>
              <th scope="col">Net</th>
              <th scope="col">Return</th>
              <th scope="col">Result</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  <span style={{ color: t.side === "long" ? "var(--div-neg)" : "var(--div-pos)" }}>
                    {t.side === "long" ? `long ${result.a.id}` : `short ${result.a.id}`}
                  </span>
                </td>
                <td className="tnum">{fmt.dateShort(t.entryT, intraday)}</td>
                <td className="tnum">{fmt.dateShort(t.exitT, intraday)}</td>
                <td className="tnum">{t.bars}</td>
                <td className="tnum">{fmt.signed(t.entryZ)}</td>
                <td className="tnum">{fmt.signed(t.exitZ)}</td>
                <td className="tnum">{fmt.num(t.beta, 2)}</td>
                <td className="tnum">{money(t.grossPnl)}</td>
                <td className="tnum">{money(-(t.fees + t.slippage))}</td>
                <td className="tnum">{money(-t.funding)}</td>
                <td
                  className="tnum font-medium"
                  style={{ color: t.win ? "var(--good-text)" : "var(--critical)" }}
                >
                  {money(t.netPnl)}
                </td>
                <td className="tnum" style={{ color: t.win ? "var(--good-text)" : "var(--critical)" }}>
                  {fmt.signed(t.returnPct)}%
                </td>
                <td>
                  <span style={{ color: t.win ? "var(--good-text)" : "var(--critical)" }}>
                    {t.win ? "✓ profit" : t.liquidated ? "✗ wiped out" : "✗ loss"}
                  </span>
                </td>
                <td
                  className="text-[11px]"
                  style={{ color: t.liquidated ? "var(--critical)" : "var(--text-muted)" }}
                >
                  {t.reason}
                </td>
              </tr>
            ))}
            {!trades.length && (
              <tr>
                <td colSpan={15} className="py-6 text-center text-[var(--text-muted)]">
                  The spread never reached ±{result.params.entryZ}σ in this range. Lower the entry threshold or
                  widen the dates.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function money(v: number): string {
  return `${v < 0 ? "−" : ""}$${fmt.num(Math.abs(v), 0)}`;
}

function isoDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function toUnix(iso: string): number {
  const ms = new Date(`${iso}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}
