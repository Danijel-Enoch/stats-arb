"use client";

import Link from "next/link";
import TopNav from "./AppShell";
import { useTheme } from "@/lib/use-theme";

const SECTIONS = [
  { id: "start", label: "Getting started" },
  { id: "scanner", label: "The scanner" },
  { id: "columns", label: "Every column" },
  { id: "charts", label: "Reading the charts" },
  { id: "backtest", label: "The backtest" },
  { id: "execution", label: "Execution & costs" },
  { id: "providers", label: "Data providers" },
  { id: "keys", label: "API keys" },
  { id: "api", label: "HTTP API" },
  { id: "limits", label: "What this does not tell you" },
];

export default function DocsBody() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <TopNav health={null} theme={theme} onTheme={setTheme} />

      <main className="mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-6">
        <header className="mb-7">
          <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.035em]">Help &amp; docs</h1>
          <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-[var(--text-muted)]">
            What every number on the dashboard means, how it is computed, and where it can mislead you.
          </p>
        </header>

        <nav className="mb-7 flex flex-wrap gap-2" aria-label="On this page">
          {SECTIONS.map((sec) => (
            <a key={sec.id} href={`#${sec.id}`} className="chip" style={{ textDecoration: "none" }}>
              {sec.label}
            </a>
          ))}
        </nav>

        <article className="prose-docs card px-6 py-6 sm:px-8 sm:py-7">
        <h2 id="start">Getting started</h2>
        <p>
          This tool looks for pairs of instruments that move together, measures how far apart they currently
          are, and tells you whether closing that gap would pay for the cost of trading it. The focus is FX,
          commodities, indices and equities; crypto is present only as a reference block.
        </p>
        <p>
          The screen is a workspace: the <strong>pair list</strong> down the left, and whichever pair you
          select filling the rest. The loop is:
        </p>
        <ul>
          <li>
            <strong>Set up the hunt</strong> behind <em>Scan</em> at the top of the list — asset classes,
            minimum correlation, whether both legs must be perp-listed. It stays collapsed because you set it
            once. The bar size lives in the top bar, since it changes what everything means.
          </li>
          <li>
            <strong>Scan the list.</strong> Each row shows only what decides whether to open it: the pair, its
            score, where the spread sits on a ±3σ track, and the net edge. The ±2σ triggers are marked on the
            track, so a dot past them is a pair worth opening. Sort, search, or filter to the ★ pairs.
          </li>
          <li>
            <strong>Read the verdict.</strong> Open a pair and the line under its name states the trade in
            words — which leg to short, which to buy, and whether the edge clears the cost — before any of the
            evidence.
          </li>
          <li>
            <strong>Check the working</strong> in the charts, then in the tabs: <em>Statistics</em>,{" "}
            <em>Execution</em>, <em>Backtest</em>, <em>Correlations</em>.
          </li>
        </ul>
        <p>
          Nothing needs configuring. Every provider used by default is keyless. Adding a free API key widens
          coverage — see <a href="#keys">API keys</a>.
        </p>

        <h2 id="scanner">The scanner</h2>
        <p>
          For the classes you select, every instrument is fetched once, then <em>every</em> pair is tested —
          including cross-class ones. That is deliberate: gold against gold miners, crude against Exxon, and
          the Canadian dollar against crude are all cross-class, and they are the relationships that actually
          persist.
        </p>
        <p>For each pair the app fits</p>
        <p>
          <code>log(A) = α + β · log(B)</code>
        </p>
        <p>
          and studies the residual — the <strong>spread</strong>. A pair is interesting when that residual is
          stationary: it wanders around a level and keeps coming back, rather than drifting away. Correlation
          alone is not enough, because two things can be perfectly correlated and still drift apart forever.
        </p>
        <p>
          <strong>Bars are inner-joined, never forward-filled.</strong> Only timestamps that both instruments
          actually traded on are used. Carrying a stale print from a closed market into an open one would
          manufacture correlation that was never there. The cost is that cross-session pairs have fewer usable
          bars, so the overlapping-bar count is printed on every chart — check it before trusting a number.
        </p>

        <h2 id="columns">Every column in the pairs table</h2>
        <ul>
          <li>
            <strong>Score</strong> — a 0–100 composite of the columns to its right, weighted toward
            stationarity and correlation stability. It is a sorting aid, not a verdict. Every input is visible
            in the row, so if you disagree with the weighting, sort by the column you trust.
          </li>
          <li>
            <strong>r</strong> — Pearson correlation of log returns over the window. Sign matters: a negative
            r means the legs move opposite, and the hedge flips accordingly.
          </li>
          <li>
            <strong>Stable</strong> — correlation on the first half of the window, then the second. If these
            disagree, the relationship is not stable and the rest of the row is built on sand.
          </li>
          <li>
            <strong>β</strong> — the hedge ratio. Hold |β| units of notional in leg B for every 1 in leg A.
          </li>
          <li>
            <strong>ADF t</strong> — Dickey–Fuller t-statistic on the spread. Below <code>−2.86</code> the
            spread is stationary at the 5% level, shown with a ✓. This is the real cointegration test and the
            single most important column.
          </li>
          <li>
            <strong>H</strong> — Hurst exponent of the spread. Below 0.5 it mean-reverts, 0.5 is a random
            walk, above 0.5 it trends. You want it low.
          </li>
          <li>
            <strong>Half-life</strong> — bars for half of a dislocation to decay, from an AR(1) fit. Very
            short is noise; very long means your capital is tied up for months.
          </li>
          <li>
            <strong>z now</strong> — how stretched the spread is right now, in standard deviations, on a
            trailing window. Beyond ±2σ is the conventional entry.
          </li>
          <li>
            <strong>Edge</strong> — what returning to the mean is worth, in basis points of notional.
          </li>
          <li>
            <strong>Cost</strong> — round-trip cost of <em>both</em> legs on the cheapest venue that lists
            them, with leg B scaled by β.
          </li>
          <li>
            <strong>Net</strong> — edge minus cost. The only column that decides anything.
          </li>
          <li>
            <strong>Perps</strong> — whether each leg is actually perp-listed. <code>both</code> means the
            trade is executable as shown.
          </li>
          <li>
            <strong>★</strong> — a classic relative-value pair the app already knows about. The{" "}
            <em>Known pairs</em> button filters to these.
          </li>
        </ul>

        <h2 id="charts">Reading the charts</h2>
        <h3>Overlay</h3>
        <p>
          Both legs sit on <strong>one</strong> axis, each indexed to 100 at the first shared bar. There is no
          second price axis on purpose: with two scales, where they line up is an arbitrary choice that can
          make unrelated series look locked together. Indexing shows the real relative move. Raw prices are in
          the crosshair tooltip and in the table view behind the <em>Table</em> button.
        </p>
        <h3>Spread z-score</h3>
        <p>
          The tradeable residual, in σ, on a trailing window. The shaded zones beyond ±2σ are entry territory;
          the panel header states the direction in words so the colour is never carrying the meaning alone.
          After a backtest runs, each trade is drawn here: a hollow circle where it opened, a filled circle
          where it closed (green for profit, red for loss), with the holding period shaded.
        </p>
        <h3>Correlation heatmap</h3>
        <p>
          Pairwise correlation of log returns among the top-ranked instruments. Blue is negative, red
          positive, neutral gray at zero. Click any cell to load that pair.
        </p>
        <p>
          Both charts share one crosshair, so they always point at the same bar, and every chart has a table
          view — no value is reachable only by hovering.
        </p>

        <h2 id="backtest">The backtest</h2>
        <p>
          The backtest is <strong>walk-forward</strong>. At every bar it refits β, the spread mean and σ using
          only the bars <em>before</em> that point, then decides. An open position keeps the β it was entered
          with, because that is the hedge actually on the books.
        </p>
        <p>
          This matters more than any other detail here. Fitting β over the whole sample and then
          &ldquo;trading&rdquo; it is the most common way a pairs backtest produces returns that were never
          available in real time. If you see a strategy with a suspiciously smooth equity curve elsewhere,
          this is usually why.
        </p>
        <h3>The rules</h3>
        <ul>
          <li>
            <strong>Entry</strong> — open when |z| reaches the entry threshold. z above the threshold means
            leg A is rich against leg B, so the position is short A / long B; below, the reverse.
          </li>
          <li>
            <strong>Exit at target</strong> — close when |z| falls back inside the exit threshold.
          </li>
          <li>
            <strong>Stop</strong> — close when |z| reaches the stop threshold. The spread kept widening; the
            relationship may have broken.
          </li>
          <li>
            <strong>Time stop</strong> — close after a maximum number of bars. Left blank, this defaults to
            four half-lives, past which the spread has shown it is not coming back.
          </li>
          <li>
            <strong>End of data</strong> — any position still open at the last bar is closed there, and
            labelled as such in the trades table so it is not mistaken for a real exit.
          </li>
        </ul>
        <h3>Leverage and liquidation</h3>
        <p>
          <strong>Leverage does not change your position size.</strong> It changes how much margin that
          position requires, and therefore two things: the return on the capital you actually put up, and
          whether the venue closes you out before your own stop is reached.
        </p>
        <p>
          <code>margin = (leg A notional + leg B notional) ÷ leverage</code>
        </p>
        <p>
          Gross P&amp;L is identical at every leverage — the same trade on the same prices. What moves is the
          denominator: at 25× the same $399 is a 3% return on notional but a 39% return on the $533 of margin
          posted. Costs do not shrink with it, which is the catch: fees and funding are charged on notional,
          so at high leverage they are an enormous fraction of your margin.
        </p>
        <p>
          <strong>Liquidation is modelled, not assumed away.</strong> Each bar, the position&rsquo;s equity is
          margin plus open P&amp;L minus accrued costs. When that falls to the maintenance margin, the venue
          closes the position and the whole margin is lost — the trade is recorded as{" "}
          <em>liquidated</em>, its return is −100%, and it is counted separately in the Liquidations tile. This
          is the part that makes leverage dangerous on a pairs trade: a spread that reliably mean-reverts can
          still travel far enough against you first to wipe out the margin, and you are not around for the
          reversion.
        </p>
        <p>
          Leverage is capped at what the venues actually allow, taking the{" "}
          <strong>more restrictive leg</strong>: gold allows 25× and Apple 5×, so a gold/Apple pair caps at 5×.
          Forex reaches 100×, forex minors 75×, exotics 50×, crypto 20–40×, metals 25×, other commodities 15×,
          indices 10×, equities 5×. If either leg has no perp listing the cap is not applied at all — but then
          the pair is not executable as perps in the first place, and the field says so.
        </p>

        <h3>Sizing and costs</h3>
        <p>
          <strong>Trade size</strong> is notional on leg A; leg B is sized at |β| × that, capped at 5× to stop
          a wild β from inventing leverage. Each trade is charged:
        </p>
        <ul>
          <li>
            <strong>Fees</strong> — round-trip bps per leg, defaulting to the real posted cost on the
            cheapest venue that lists it (gTrade spread + both position-size fees, or Hyperliquid taker).
          </li>
          <li>
            <strong>Funding</strong> — bps per day on gross notional of both legs, multiplied by the days
            held. Defaults to the venue&rsquo;s published rate where one exists (Hyperliquid), otherwise an
            assumption you should set yourself. On multi-day holds funding usually dominates fees.
          </li>
          <li>
            <strong>Slippage</strong> — bps on both legs per round trip, yours to set.
          </li>
        </ul>
        <h3>Reading the results</h3>
        <ul>
          <li>
            <strong>Net P&amp;L</strong> is after every cost above. <strong>Gross</strong> in the trades table
            is before them — the gap between the two is the honest part of the exercise.
          </li>
          <li>
            <strong>Profit factor</strong> is gross wins ÷ gross losses. Below 1.0 the strategy loses money
            regardless of win rate.
          </li>
          <li>
            <strong>Max drawdown</strong> is computed on the mark-to-market equity curve, so it includes pain
            inside open trades, not just realised losses.
          </li>
          <li>
            <strong>Sharpe</strong> is annualised from the observed trade frequency. With a handful of trades
            it is close to meaningless — check the trade count before reading it.
          </li>
          <li>
            <strong>Exits</strong> tells you how the trades ended. Mostly stops means the entry threshold is
            too tight or the pair is not really mean-reverting.
          </li>
          <li>
            The <strong>equity curve</strong> shows mark-to-market and realised P&amp;L together, with shading
            where a position was open.
          </li>
        </ul>
        <p>
          A backtest over one window with a handful of trades is an anecdote. Vary the dates, the thresholds
          and the lookback; if the result only survives one particular combination, it is curve fitting.
        </p>

        <h2 id="execution">Execution &amp; costs</h2>
        <p>
          The <em>Execution</em> card lists, for both legs: the venue, the symbol there, the round-trip cost,
          the funding carry per hour where the venue publishes one, the leverage cap, and whether that market
          is open right now.
        </p>
        <p>
          Market hours are real and they matter. gTrade publishes separate open/closed flags for forex,
          stocks, indices and commodities, shown in the session strip under the filter row. A pair whose legs
          trade in different sessions cannot be entered simultaneously for part of the day, and that gap is
          exactly where overnight dislocations appear.
        </p>

        <h2 id="providers">Data providers</h2>
        <p>
          No single market-data host stays up, so reachability is treated as a first-class concern. Candles
          are fetched through a priority chain; each provider declares what it can serve, the registry
          deprioritises anything a recent health probe marked down, and the first provider that answers wins.
          The one that served each leg is named in the chart legend.
        </p>
        <ul>
          <li>
            <strong>Yahoo Finance</strong> — primary. FX, futures, indices, equities, crypto, all bar sizes.
            It rate-limits an IP hard under bursts; a 429 trips a 90-second circuit breaker so a scan does not
            pay doomed retries on every symbol.
          </li>
          <li>
            <strong>Twelve Data</strong> — FX, equities, commodity CFDs. Without a key it falls back to the
            shared demo key, which only answers for a few FX majors.
          </li>
          <li>
            <strong>Nasdaq</strong> — keyless daily OHLC for US stocks and ETFs, plus the current
            session&rsquo;s minute bars. The main reason the app survives a Yahoo throttle.
          </li>
          <li>
            <strong>Hyperliquid</strong> — crypto perp candles, and the venue source for crypto funding.
          </li>
          <li>
            <strong>Alpha Vantage</strong> — with a key: FX, equities, and spot commodity series. The only
            free source covering all three focus areas.
          </li>
          <li>
            <strong>ECB / Frankfurter</strong> — FX dailies only, effectively never down. The last-resort FX
            leg.
          </li>
          <li>
            <strong>CoinGecko</strong> — crypto spot fallback.
          </li>
          <li>
            <strong>gTrade (Gains Network)</strong> — perp listings, spreads, fees, leverage caps and market
            hours for ~490 pairs including FX, equities, indices and commodities.
          </li>
          <li>
            <strong>Pyth</strong> — feed metadata for the symbol universe and market-hours flags.
          </li>
        </ul>
        <h3>ETF proxies</h3>
        <p>
          If every direct provider for an instrument fails, the app retries with a US-listed ETF that tracks
          it — gold → <code>GLD</code>, WTI → <code>USO</code>, DAX → <code>EWG</code>. This is a{" "}
          <strong>different instrument wearing the same name</strong>: it carries tracking error, roll cost
          and equity-session hours. So it is never silent — the leg is labelled <em>via GLD</em> in the
          legend, a banner explains what changed, and every proxied instrument is listed in the footnotes.
        </p>
        <p>
          Provider status sits behind the counter in the top bar — one dot when all is well, the full list
          and the market-hours flags when you open it. Green is reachable, amber needs a key, red is
          unreachable. <em>Re-probe</em> forces a fresh check.
        </p>

        <h2 id="keys">API keys</h2>
        <p>
          All optional. Copy <code>.env.example</code> to <code>.env.local</code> and restart.
        </p>
        <ul>
          <li>
            <code>ALPHAVANTAGE_API_KEY</code> — the most useful one to add. Free tier covers FX dailies, US
            equity intraday and daily, and spot commodity series.
          </li>
          <li>
            <code>TWELVEDATA_API_KEY</code> — unlocks FX, equities and commodity CFDs properly instead of the
            shared demo key.
          </li>
          <li>
            <code>PYTH_API_KEY</code> — Pyth feed metadata is public and already in use; price reads now need
            a key.
          </li>
        </ul>
        <p>
          <strong>Intraday is the thin spot.</strong> Without a key, Yahoo is the only source of 1h and 4h
          bars for non-crypto instruments, so when it throttles, intraday fails while daily keeps working via
          Nasdaq and the ECB. Either free key above closes that gap.
        </p>

        <h2 id="api">HTTP API</h2>
        <p>Everything the UI does is available directly:</p>
        <ul>
          <li>
            <code>GET /api/health</code> — provider reachability. <code>?force=1</code> skips the cache.
          </li>
          <li>
            <code>GET /api/scan?cls=fx,metals&amp;tf=1d&amp;minCorr=0.6&amp;tradableOnly=1</code> — ranked
            pairs plus the correlation matrix.
          </li>
          <li>
            <code>GET /api/candles?a=XAUUSD&amp;b=XAGUSD&amp;tf=1d</code> — one pair, aligned and indexed,
            with spread and rolling z.
          </li>
          <li>
            <code>GET /api/backtest?a=XAUUSD&amp;b=XAGUSD&amp;tf=1d&amp;entryZ=2&amp;exitZ=0.5</code> — full
            trade list, equity curve and summary. Also accepts <code>stopZ</code>, <code>lookback</code>,{" "}
            <code>maxBars</code>, <code>capital</code>, <code>feeBpsA</code>, <code>feeBpsB</code>,{" "}
            <code>fundingBpsPerDay</code>, <code>slippageBps</code>, <code>side</code>, and{" "}
            <code>from</code>/<code>to</code> as unix seconds.
          </li>
          <li>
            <code>GET /api/venues</code> — perp listings, costs and session state per instrument.
          </li>
        </ul>
        <p>
          Bar sizes are <code>15m</code>, <code>1h</code>, <code>4h</code>, <code>1d</code>, <code>1w</code>.
        </p>

        <h2 id="limits">What this does not tell you</h2>
        <ul>
          <li>
            <strong>The scanner&rsquo;s β and z are in-sample.</strong> They are fitted on the same window
            they are measured over, so they describe the past. The backtest is the walk-forward version; the
            scanner is not. A high score is a reason to investigate, not a signal.
          </li>
          <li>
            <strong>Costs exclude the borrow on the short leg</strong>, and funding in the scanner&rsquo;s
            Net column is not charged at all — only the backtest charges it.
          </li>
          <li>
            <strong>Different sessions, different closes.</strong> A daily FX bar and a daily US equity bar do
            not end at the same instant. Cross-class daily correlations carry a timing mismatch that no
            alignment removes.
          </li>
          <li>
            <strong>Testing hundreds of pairs finds some that look good by chance.</strong> With 700 pairs
            tested, a handful will clear any threshold on noise alone. This is why correlation stability and
            the ADF test are weighted most heavily — and why a pair with an economic reason to co-move
            deserves more trust than one without.
          </li>
          <li>
            <strong>ETF proxies are not the underlying</strong>, and are always labelled when used.
          </li>
          <li>
            <strong>Historical data is not adjusted for dividends or futures rolls</strong> on every provider,
            which shows up as spurious jumps in the spread on roll dates.
          </li>
          <li>None of this is trade advice.</li>
        </ul>
        </article>

        <footer className="px-1 pt-6 pb-10 text-[13px] text-[var(--text-muted)]">
          <Link href="/" style={{ color: "var(--series-1)", textDecoration: "none" }}>
            ← Back to the scanner
          </Link>
        </footer>
      </main>
    </>
  );
}
