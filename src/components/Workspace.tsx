"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopNav from "./AppShell";
import BacktestPanel from "./BacktestPanel";
import CorrHeatmap from "./CorrHeatmap";
import ExecutionCard, { type VenuesResponse } from "./ExecutionCard";
import FiltersPanel from "./FiltersPanel";
import OverlayChart from "./OverlayChart";
import PairHeader from "./PairHeader";
import PairList from "./PairList";
import SpreadPanel from "./SpreadPanel";
import StatTiles from "./StatTiles";
import type { HealthResponse, PairResponse, ScanResponse } from "@/lib/client-types";
import type { Trade } from "@/lib/backtest";
import { useIsCompact } from "@/lib/use-media-query";
import { useTheme } from "@/lib/use-theme";
import { Spinner, Tabs } from "./ui";

const DEFAULT_CLASSES = ["fx", "metals", "energy", "indices"];

type TabId = "stats" | "execution" | "backtest" | "matrix";

const TABS: { id: TabId; label: string }[] = [
  { id: "stats", label: "Statistics" },
  { id: "execution", label: "Execution" },
  { id: "backtest", label: "Backtest" },
  { id: "matrix", label: "Correlations" },
];

export default function Workspace() {
  const { theme, setTheme } = useTheme();

  const [classes, setClasses] = useState<string[]>(DEFAULT_CLASSES);
  const [tf, setTf] = useState("1d");
  const [minCorr, setMinCorr] = useState(0.6);
  const [tradableOnly, setTradableOnly] = useState(false);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [pair, setPair] = useState<PairResponse | null>(null);
  const [venues, setVenues] = useState<VenuesResponse | null>(null);
  const [selected, setSelected] = useState({ a: "XAUUSD", b: "XAGUSD" });

  const [scanning, setScanning] = useState(false);
  const [loadingPair, setLoadingPair] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("stats");
  const [btTrades, setBtTrades] = useState<Trade[] | null>(null);

  // Below lg there is only room for one pane, so the two become screens: the
  // list, and the pair you tapped — with a way back.
  const compact = useIsCompact();
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");

  const refreshHealth = useCallback(async (force = false) => {
    try {
      const r = await fetch(`/api/health${force ? "?force=1" : ""}`);
      setHealth(await r.json());
    } catch {
      /* the status strip keeps its last reading */
    }
  }, []);

  const scanSeq = useRef(0);
  const runScan = useCallback(async () => {
    const seq = ++scanSeq.current;
    setScanning(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        cls: classes.join(","),
        tf,
        minCorr: String(minCorr),
        tradableOnly: tradableOnly ? "1" : "0",
      });
      const r = await fetch(`/api/scan?${qs}`);
      const j: ScanResponse = await r.json();
      if (seq !== scanSeq.current) return;
      if (j.error) {
        setError(j.error);
        return;
      }
      setScan(j);
      const stillThere = j.pairs.some((p) => p.a === selected.a && p.b === selected.b);
      if (!stillThere && j.pairs.length) setSelected({ a: j.pairs[0].a, b: j.pairs[0].b });
    } catch (e) {
      if (seq === scanSeq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === scanSeq.current) setScanning(false);
    }
    // selected is read, not depended on — picking a pair must not rescan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, minCorr, tf, tradableOnly]);

  const pairSeq = useRef(0);
  const loadPair = useCallback(async (a: string, b: string, timeframe: string) => {
    const seq = ++pairSeq.current;
    setLoadingPair(true);
    try {
      const r = await fetch(`/api/candles?a=${a}&b=${b}&tf=${timeframe}`);
      const j: PairResponse = await r.json();
      if (seq !== pairSeq.current) return;
      if (j.error) {
        setError(j.error);
        setPair(null);
        return;
      }
      setPair(j);
      setError(null);
    } catch (e) {
      if (seq === pairSeq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === pairSeq.current) setLoadingPair(false);
    }
  }, []);

  // These effects synchronize React with an external system — the HTTP APIs —
  // whenever the parameters that scope them change. The loading flag is part of
  // that synchronization, so the set-state-in-effect rule is waived here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshHealth();
    void (async () => {
      try {
        const r = await fetch("/api/venues");
        setVenues(await r.json());
      } catch {
        /* the Execution tab degrades to "not listed" */
      }
    })();
  }, [refreshHealth]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runScan();
  }, [runScan]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPair(selected.a, selected.b, tf);
  }, [loadPair, selected, tf]);

  const pick = useCallback((a: string, b: string) => {
    setSelected({ a, b });
    setMobilePane("detail");
  }, []);

  const starred = useMemo(
    () =>
      Boolean(
        scan?.watchlist.includes(`${selected.a}|${selected.b}`) ||
          scan?.watchlist.includes(`${selected.b}|${selected.a}`),
      ),
    [scan?.watchlist, selected],
  );

  const proxied = useMemo(
    () => [pair?.a, pair?.b].filter((l) => l?.proxiedBy) as { id: string; proxiedBy?: string }[],
    [pair],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNav
        health={health}
        theme={theme}
        onTheme={setTheme}
        onRefresh={() => void refreshHealth(true)}
        sessions={scan?.sessions}
        sources={scan?.sources}
        right={
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
            <span className="hidden sm:inline">Bars</span>
            <select
              value={tf}
              onChange={(e) => setTf(e.target.value)}
              aria-label="Bar size"
              className="inp h-7 w-auto text-[12px]"
            >
              {["15m", "1h", "4h", "1d", "1w"].map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div
          className={`flex min-h-0 flex-col border-r hair ${
            compact && mobilePane === "detail" ? "hidden" : ""
          }`}
        >
          <FiltersPanel
            classes={classes}
            onClasses={setClasses}
            minCorr={minCorr}
            onMinCorr={setMinCorr}
            tradableOnly={tradableOnly}
            onTradableOnly={setTradableOnly}
            loading={scanning}
            onRescan={() => void runScan()}
            live={scan?.instrumentsLive}
            requested={scan?.instrumentsRequested}
          />
          <PairList scan={scan} selected={selected} onSelect={pick} stale={scanning} />
        </div>

        <main
          className={`flex min-h-0 min-w-0 flex-col overflow-y-auto ${
            compact && mobilePane === "list" ? "hidden" : ""
          } ${compact ? "anim-slide" : ""}`}
          key={compact ? mobilePane : undefined}
        >
          {compact && (
            <div className="sticky top-0 z-20 border-b px-3 py-2 hair" style={{ background: "var(--page)" }}>
              <button
                type="button"
                onClick={() => setMobilePane("list")}
                className="chip h-8"
              >
                <span aria-hidden="true">←</span> All pairs
              </button>
            </div>
          )}
          {error && (
            <div
              className="anim-fade mx-4 mt-4 rounded-[10px] border px-4 py-3 text-[12.5px] leading-relaxed sm:mx-5"
              role="status"
              style={{ borderColor: "var(--critical)", color: "var(--text-secondary)" }}
            >
              <strong style={{ color: "var(--critical)" }}>Error · </strong>
              {error}
            </div>
          )}

          {pair ? (
            <>
              <PairHeader data={pair} starred={starred} />

              {proxied.length > 0 && (
                <div
                  className="anim-fade mx-4 mt-4 rounded-[10px] border px-4 py-2.5 text-[12px] leading-relaxed sm:mx-5"
                  role="status"
                  style={{ borderColor: "var(--warning)" }}
                >
                  <strong style={{ color: "var(--warning)" }}>Proxy data. </strong>
                  <span className="text-[var(--text-secondary)]">
                    {proxied.map((l) => `${l.id} is drawn from ${l.proxiedBy}`).join("; ")} — every direct
                    provider was unreachable. An ETF proxy carries tracking error, roll cost and equity-session
                    hours, so these statistics describe the proxy.
                  </span>
                </div>
              )}

              <div className="anim-rise flex flex-col gap-4 px-4 py-4 sm:px-5">
                <OverlayChart data={pair} hoverIndex={hover} onHover={setHover} stale={loadingPair} />
                <SpreadPanel
                  data={pair}
                  hoverIndex={hover}
                  onHover={setHover}
                  stale={loadingPair}
                  trades={btTrades}
                />
              </div>

              <div
                className="sticky z-10 border-y px-4 hair sm:px-5"
                style={{ background: "var(--page)", top: compact ? 44 : 0 }}
              >
                <Tabs tabs={TABS} active={tab} onChange={setTab} label="Pair detail" />
              </div>

              {/* keyed so each tab's content animates in rather than swapping */}
              <div key={tab} className="anim-rise px-4 py-4 pb-10 sm:px-5">
                {tab === "stats" && <StatTiles data={pair} />}
                {tab === "execution" && <ExecutionCard data={pair} venues={venues} />}
                {tab === "backtest" && (
                  <BacktestPanel a={selected.a} b={selected.b} tf={tf} onTrades={setBtTrades} />
                )}
                {tab === "matrix" && scan && <CorrHeatmap scan={scan} onPick={pick} stale={scanning} />}

                {scan && tab === "stats" && <Footnotes scan={scan} />}
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-6 text-center">
              {loadingPair ? (
                <span className="flex items-center gap-2.5 text-[13px] text-[var(--text-muted)]">
                  <Spinner /> Loading pair…
                </span>
              ) : (
                <p className="max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {error ? "Pick another pair from the list." : "No pair loaded."}
                </p>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Footnotes({ scan }: { scan: ScanResponse }) {
  return (
    <footer className="mt-5 flex flex-col gap-2 border-t pt-4 text-[11.5px] leading-relaxed text-[var(--text-muted)] hair">
      {scan.proxied.length > 0 && (
        <p>
          <strong>Proxied:</strong> {scan.proxied.map((p) => `${p.instrument}→${p.proxy}`).join(", ")} — direct
          providers were unreachable, so an ETF stand-in was used.
        </p>
      )}
      {scan.unavailable.length > 0 && (
        <p>
          <strong>No data:</strong> {scan.unavailable.map((u) => u.instrument).join(", ")} — every provider that
          covers them failed this run.
        </p>
      )}
      <p>
        β is an in-sample OLS hedge ratio and the z-score is computed on the same window, so both are fitted to
        the past. A pair that passes here is a candidate to study, not a signal to trade; costs shown are venue
        spread and fees only, and exclude funding, slippage and the borrow on the short leg.
      </p>
    </footer>
  );
}
