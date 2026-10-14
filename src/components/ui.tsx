"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Geist's spinner: twelve spokes fading in sequence, not a rotating arc. */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size, display: "inline-block" }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x="11"
            y="1"
            width="2"
            height="6"
            rx="1"
            fill="currentColor"
            opacity={0.15 + (i / 12) * 0.85}
            transform={`rotate(${i * 30} 12 12)`}
          />
        ))}
      </svg>
    </span>
  );
}

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} style={style} />;
}

/** Placeholder rows for the pair list while the first scan is in flight. */
export function PairListSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-b px-3 py-2 hair">
          <div className="flex items-center justify-between gap-2">
            <Skeleton style={{ height: 12, width: `${48 + ((i * 13) % 34)}%` }} />
            <Skeleton style={{ height: 16, width: 26, borderRadius: 4 }} />
          </div>
          <Skeleton className="mt-2.5" style={{ height: 6, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

/**
 * Tabs with an underline that travels between them. The indicator is measured
 * from the live DOM rather than computed, so it stays correct when labels wrap
 * or the font loads late.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    // Re-measure when the font or container width changes under us.
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [active, tabs]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange(tabs[(i + 1) % tabs.length].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(tabs[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(tabs[tabs.length - 1].id);
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      // scrollable on narrow screens rather than wrapping to two rows
      className="scroll-x relative -mb-px flex gap-1"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          data-tab={t.id}
          role="tab"
          type="button"
          tabIndex={active === t.id ? 0 : -1}
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className="shrink-0 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors"
          style={{
            color: active === t.id ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: active === t.id ? 500 : 400,
          }}
        >
          {t.label}
        </button>
      ))}
      {bar && <span aria-hidden="true" className="tab-underline" style={{ left: bar.left, width: bar.width }} />}
    </div>
  );
}
