"use client";

import { useState } from "react";
import { ASSET_CLASSES } from "@/lib/types";
import { Spinner } from "./ui";

/**
 * Scan controls, collapsed by default. They set up the hunt and are then left
 * alone, so they do not deserve permanent screen space next to the result.
 */
export default function FiltersPanel({
  classes,
  onClasses,
  minCorr,
  onMinCorr,
  tradableOnly,
  onTradableOnly,
  loading,
  onRescan,
  live,
  requested,
}: {
  classes: string[];
  onClasses: (c: string[]) => void;
  minCorr: number;
  onMinCorr: (v: number) => void;
  tradableOnly: boolean;
  onTradableOnly: (v: boolean) => void;
  loading: boolean;
  onRescan: () => void;
  live?: number;
  requested?: number;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onClasses(classes.includes(id) ? classes.filter((c) => c !== id) : [...classes, id]);

  const summary =
    classes.length === ASSET_CLASSES.length
      ? "all classes"
      : classes.length
        ? classes.map((c) => ASSET_CLASSES.find((a) => a.id === c)?.label ?? c).join(", ")
        : "no classes";

  return (
    <div className="border-b hair">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className="text-[10px] text-[var(--text-muted)] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ▶
        </span>
        <span className="text-[12.5px] text-[var(--text-secondary)]">Scan</span>
        <span className="truncate text-[12px] text-[var(--text-muted)]">
          {summary} · |r| ≥ {minCorr.toFixed(2)}
          {tradableOnly ? " · perp-listed" : ""}
        </span>
        {live !== undefined && requested !== undefined && (
          <span className="tnum ml-auto shrink-0 text-[11.5px] text-[var(--text-muted)]">
            {live}/{requested}
          </span>
        )}
      </button>

      {open && (
        <div className="anim-rise flex flex-col gap-3 px-3 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {ASSET_CLASSES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip h-[26px] px-2.5 text-[11.5px]"
                aria-pressed={classes.includes(c.id)}
                onClick={() => toggle(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2.5 text-[12px] text-[var(--text-muted)]">
            Min |r|
            <input
              type="range"
              min={0.3}
              max={0.95}
              step={0.05}
              value={minCorr}
              onChange={(e) => onMinCorr(Number(e.target.value))}
              className="flex-1"
            />
            <span className="tnum w-8 text-right text-[var(--text-primary)]">{minCorr.toFixed(2)}</span>
          </label>

          <button
            type="button"
            className="chip h-[26px] self-start px-2.5 text-[11.5px]"
            aria-pressed={tradableOnly}
            onClick={() => onTradableOnly(!tradableOnly)}
          >
            Both legs perp-listed
          </button>

          <button
            type="button"
            onClick={onRescan}
            disabled={loading}
            className="btn btn-primary h-8 gap-2 text-[12.5px]"
          >
            {loading && <Spinner size={13} />}
            {loading ? "Scanning…" : "Rescan"}
          </button>
        </div>
      )}
    </div>
  );
}
