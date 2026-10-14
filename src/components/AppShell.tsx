"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { HealthResponse } from "@/lib/client-types";

/**
 * Geist app chrome. Provider health lives behind a popover rather than a
 * permanent strip: it matters when something breaks, and the rest of the time
 * a single dot says everything.
 */
export default function TopNav({
  health,
  theme,
  onTheme,
  onRefresh,
  sessions,
  sources,
  right,
}: {
  health: HealthResponse | null;
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
  onRefresh?: () => void;
  sessions?: Record<string, boolean>;
  sources?: Record<string, number>;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 hair sm:gap-3 sm:px-5">
      <Link href="/" className="flex items-center gap-2.5" style={{ textDecoration: "none" }}>
        <Mark />
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          Perp Stat-Arb
        </span>
      </Link>

      <span aria-hidden="true" className="hidden h-5 w-px md:block" style={{ background: "var(--border)" }} />
      <span className="hidden text-[12.5px] text-[var(--text-muted)] md:inline">
        FX · commodities · indices · equities
      </span>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {right}
        {health && (
          <SourcesPopover health={health} onRefresh={onRefresh} sessions={sessions} sources={sources} />
        )}
        <button
          type="button"
          className="chip"
          onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <Link href="/docs" className="chip" style={{ textDecoration: "none" }}>
          Docs
        </Link>
      </div>
    </header>
  );
}

function SourcesPopover({
  health,
  onRefresh,
  sessions,
  sources,
}: {
  health: HealthResponse;
  onRefresh?: () => void;
  sessions?: Record<string, boolean>;
  sources?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const live = health.providers.filter((p) => p.ok).length;
  const total = health.providers.length;
  const allLive = live === total;
  const down = health.providers.filter((p) => !p.ok && !p.needsKey);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        title={
          down.length ? `${down.map((d) => d.label).join(", ")} unreachable` : "All data sources reachable"
        }
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: allLive ? "var(--good)" : live > 0 ? "var(--warning)" : "var(--critical)",
          }}
        />
        <span className="tnum">
          {live}/{total}
        </span>
        <span className="hidden sm:inline">sources</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Data sources and market hours"
          className="anim-pop absolute right-0 z-40 mt-2 w-[min(330px,calc(100vw-1.5rem))] rounded-[10px] border p-3 hair"
          style={{ background: "var(--surface-1)", boxShadow: "var(--shadow-lg)" }}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[12.5px] font-semibold text-[var(--text-primary)]">Data sources</h3>
            {onRefresh && (
              <button type="button" className="chip h-[22px] px-2 text-[11px]" onClick={onRefresh}>
                Re-probe
              </button>
            )}
          </div>

          <ul className="flex flex-col gap-1.5">
            {health.providers.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 text-[12px]">
                <span
                  aria-hidden="true"
                  className="mt-[5px] shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: p.ok ? "var(--good)" : p.needsKey ? "var(--warning)" : "var(--critical)",
                  }}
                />
                <span className="shrink-0" style={{ color: p.ok ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {p.label}
                </span>
                <span className="truncate text-[11.5px] text-[var(--text-muted)]" title={p.note}>
                  {p.note}
                </span>
                <span className="sr-only">
                  {p.ok ? "reachable" : p.needsKey ? "needs an API key" : "unreachable"}
                </span>
              </li>
            ))}
          </ul>

          {sessions && Object.keys(sessions).length > 0 && (
            <>
              <h3 className="mt-3 mb-2 border-t pt-3 text-[12.5px] font-semibold text-[var(--text-primary)] hair">
                Perp market hours
              </h3>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {Object.entries(sessions).map(([k, isOpen]) => (
                  <span key={k} className="flex items-center gap-1.5 text-[12px]">
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: isOpen ? "var(--good)" : "var(--ds-gray-600)",
                      }}
                    />
                    <span className="capitalize text-[var(--text-secondary)]">{k}</span>
                    <span className="text-[var(--text-muted)]">{isOpen ? "open" : "closed"}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {sources && Object.keys(sources).length > 0 && (
            <p className="mt-3 border-t pt-2.5 text-[11.5px] leading-relaxed text-[var(--text-muted)] hair">
              This scan was served by{" "}
              {Object.entries(sources)
                .map(([s, n]) => `${s} (${n})`)
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A spread converging on its mean — the thing the whole app is about. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="21" rx="5.5" fill="none" stroke="var(--border-strong)" />
      <path d="M4 15.5 L8 7 L12 13 L18 5.5" fill="none" stroke="var(--series-1)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 11 L10 14.5 L14 9 L18 11.5" fill="none" stroke="var(--series-2)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
