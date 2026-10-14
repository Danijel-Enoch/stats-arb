# Perp Stat-Arb Scanner

Finds correlated, mean-reverting pairs across **FX, commodities, indices and
equities** — then shows whether you can actually put the trade on as perps, and
whether the dislocation clears the cost of doing so.

Crypto is included as a reference block, but it is deliberately not the focus.

```bash
npm install
npm run dev     # http://localhost:3000
```

No API keys required. Copy `.env.example` to `.env.local` if you want to widen
coverage.

---

## What it does

**1. Finds the pairs.** Pick asset classes and a bar size; the scanner fetches
every instrument once and scores all pairs — including cross-class ones, since
gold/miners, crude/Exxon and CAD/crude are where the money is and all three
cross classes.

For each pair it reports, as separate columns rather than a black-box number:

| Column | Meaning |
|---|---|
| `r` | Pearson correlation of log returns |
| `Stable` | correlation on the first half vs second half of the window — a correlation that exists in only one half is a mirage |
| `β` | OLS hedge ratio from `log A = α + β·log B`; how much of leg B per unit of leg A |
| `ADF t` | Dickey–Fuller t-stat on the residual. Below −2.86 is stationary at 5% — this is the actual cointegration test |
| `H` | Hurst exponent of the spread. Below 0.5 mean-reverts; above 0.5 trends |
| `Half-life` | bars for half a dislocation to decay, from an AR(1) fit |
| `z now` | current dislocation in σ |
| `Edge` | distance back to the mean, in bps of notional |
| `Cost` | round-trip perp cost of **both** legs (leg B sized at β) on the cheapest venue |
| `Net` | edge − cost. The only column that decides anything |
| `Perps` | whether each leg is actually perp-listed, and where |

`Score` is a 0–100 composite of those, weighted toward stationarity and
correlation stability. Every input is visible in the row, so you can disagree
with the weighting and sort by the column you trust instead.

**2. Draws them overlaid.** Both legs on **one** axis, each indexed to 100 at
the first shared bar. Two price axes would let the chart manufacture a
relationship by choosing where the scales line up; indexing shows the real
relative move, and raw prices stay in the crosshair and the table view.

Below it, the tradeable residual — `log(A) − (α + β·log(B))` in σ — gets its own
panel, with the ±2σ entry zones shaded and the trade direction spelled out in
words. Both charts share one crosshair, so they always point at the same bar.

**3. Tells you if you can trade it.** Perp listings, round-trip costs, leverage
caps and live market-hours flags come from the venues themselves, so a pair
flagged `both` really is executable on both legs right now.

**4. Backtests the rule.** See below.

An in-app **Help & docs** page at `/docs` explains every column, every chart and
every parameter, with a section on what the numbers do *not* tell you.

The UI is built on **Geist**, Vercel's design system — the `--ds-*` scale in
`globals.css` is Geist's own, and everything else is written against semantic
aliases on top of it. Chart series colours are the one deliberate exception:
Geist's bright accents (`blue-900`, `amber-900`) are tuned for links and
buttons and sit above the lightness band a data mark needs, so each series slot
was snapped to the nearest passing step on the same ramp and validated for
colour-vision separation and contrast against the actual chart surface.

---

## The backtest

The backtest is **walk-forward**. At every bar it refits β, the spread mean and
σ using only the bars *before* that point, then decides. An open position keeps
the β it was entered with, because that is the hedge actually on the books.

This is the part that matters most. Fitting β over the whole sample and then
"trading" it is the most common way a pairs backtest produces returns that were
never available in real time, and it is why so many published pair strategies
have suspiciously smooth equity curves.

**Rules** — open when `|z|` reaches the entry threshold (above it, leg A is rich
→ short A / long B); close at the exit threshold, at the stop threshold, after a
maximum hold, or at the last bar. Positions closed by running out of data are
labelled as such so they are not mistaken for real exits.

**Leverage** does not change position size — it changes the margin that position
requires (`margin = gross notional ÷ leverage`), and so the return on capital
actually posted. Gross P&L is identical at every leverage; costs are charged on
notional and do not shrink with it, which at high leverage is most of the story.

**Liquidation is modelled.** Each bar the position's equity is margin + open P&L
− accrued costs; when that reaches the maintenance margin the venue closes it and
the whole margin is lost — recorded as a `liquidated` exit at −100%, counted
separately. This is the part that makes leverage dangerous on a pairs trade: a
spread that reliably mean-reverts can still travel far enough against you first
to wipe out the margin, and you are not around for the reversion.

Leverage is capped at what the venues allow, taking the **more restrictive leg** —
gold allows 25× and Apple 5×, so gold/Apple caps at 5×. Forex 100×, minors 75×,
exotics 50×, crypto 20–40×, metals 25×, other commodities 15×, indices 10×,
equities 5×. If either leg is unlisted no cap applies, but then the pair isn't
executable as perps at all and the field says so.

**Sizing and costs** — trade size is notional on leg A; leg B is sized at `|β| ×`
that, capped at 5×. Every trade is charged:

| Cost | Default |
|---|---|
| Fees | the real posted round trip on the cheapest venue listing each leg — gTrade spread + both position-size fees, or Hyperliquid taker |
| Funding | the venue's own published rate where one exists (Hyperliquid), in bps/day on gross notional of both legs × days held |
| Slippage | yours to set, charged on both legs per round trip |

Every default is editable: date range, entry/exit/stop `z`, fit lookback, max
hold, trade size, per-leg fees, funding, slippage, and which side of the spread
to take.

**Results** — net P&L, trade count and win rate, profit factor, max drawdown
(computed on the *mark-to-market* curve, so it includes pain inside open
trades), Sharpe annualised from observed trade frequency, average hold and time
in market, and a breakdown of how trades ended (target / stop / time / still
open).

The **trades table** lists every trade: side, entry and exit timestamps, bars
held, entry and exit `z`, the β it was opened with, gross P&L, fees, funding,
net P&L, return, win or loss, and why it closed. Each trade is also drawn on the
spread chart — hollow circle at entry, filled at exit, green for profit and red
for loss, with the holding period shaded.

A backtest over one window with a handful of trades is an anecdote. Vary the
dates, the thresholds and the lookback; if a result only survives one particular
combination, it is curve fitting.

---

## Provider failover

The premise is that no single price API stays up, so the app treats
reachability as a first-class concern rather than an afterthought.

**Candles** are fetched through a priority chain. Each provider declares which
instruments and bar sizes it can serve; the registry walks the chain in order,
deprioritises anything a recent health probe marked down, and takes the first
provider that actually answers. The provider that served each leg is printed in
the chart legend.

| Provider | Covers | Key | Notes |
|---|---|---|---|
| Yahoo Finance | FX, futures, indices, equities, crypto — all bar sizes | no | Primary. Rate-limits an IP hard under bursts; a 429 trips a 90s circuit breaker so a scan doesn't pay doomed retries on every symbol |
| Twelve Data | FX, equities, commodity CFDs | optional | Falls back to the shared `demo` key, which only answers for a few FX majors |
| Nasdaq | US stocks and ETFs — daily, plus the current session's minute bars | no | Keyless and reliable; the main reason the app survives a Yahoo throttle |
| Hyperliquid | crypto perps + funding | no | Also the venue source for crypto perp costs and funding |
| Alpha Vantage | FX, equities, **spot commodities** | optional | The most valuable key to add — nothing else free covers commodity series |
| ECB / Frankfurter | FX dailies only | no | Effectively never down; the last-resort FX leg |
| CoinGecko | crypto spot | no | Crypto fallback |

**ETF proxy fallback.** If every direct provider for an instrument fails, the
app retries with a US-listed ETF that tracks it (gold → `GLD`, WTI → `USO`,
DAX → `EWG`, and so on). This is a different instrument wearing the same name —
tracking error, roll cost, equity-session hours — so it is never silent: the
leg is labelled `via GLD` in the legend, a warning banner explains what changed,
and proxied instruments are listed in the footnotes.

**Venue and metadata sources**, health-checked alongside the rest:

- **gTrade (Gains Network)** — the reason this works for non-crypto at all:
  ~490 perp pairs including 37 FX, 62 equities, 10 indices and 8
  metals/energy, with per-pair spreads, fees, leverage caps, and the
  per-asset-class market-open flags shown in the session strip.
- **Hyperliquid** — crypto perp funding, mark price, leverage caps.
- **Pyth** — feed metadata for the symbol universe and market-hours flags
  (public); price reads need `PYTH_API_KEY`.

Provider status is live in the header: green reachable, amber needs a key, red
unreachable. `Re-probe` forces a fresh check.

**Intraday is the thin spot.** Without a key, Yahoo is the only source of 1h and
4h bars for non-crypto instruments, so when it throttles, intraday fails while
daily keeps working through Nasdaq and the ECB. Either free key in
`.env.example` closes that gap, and the error message says so when it happens.

---

## Design

Dark and light are both selected, not flipped: each mode defines its own Geist
steps, declared under the OS media query *and* the explicit theme attribute so
the in-app toggle wins either way.

The theme has three states, which is what that CSS expects. With no explicit
choice the root is left unstamped and `prefers-color-scheme` decides — including
live, if the viewer changes their OS setting while the page is open. Choosing a
theme stamps `data-theme` and persists it, and a pre-paint script in the layout
re-applies it on the next load so a stored choice never flashes the other theme.
It is modelled as an external store (`useSyncExternalStore`) rather than
effect-synced state, because the source of truth genuinely lives outside React.

The screen is a workspace, not a dashboard: a scannable pair list down the left,
and the selected pair filling the rest. The verdict — which leg to short, which
to buy, whether the edge clears the cost — is stated in words directly under the
pair's name, before any of the evidence. The statistics, execution detail,
backtest and correlation matrix sit behind tabs rather than all competing for
attention at once, and the scan controls collapse once they are set.

**Motion** is decorative only — it signals that something arrived or changed,
never what the data says. Content rises in, the tab underline travels between
tabs, the sources popover scales in from its trigger, and loading states use a
shimmer skeleton or a spinner rather than a layout-shifting placeholder. All of
it collapses to near-zero under `prefers-reduced-motion`.

**Mobile** is not the desktop layout squeezed. Below `lg` the two panes become
two screens: the pair list, and the pair you tapped, with a back control. The
charts shorten, the tab strip scrolls horizontally rather than wrapping, and the
backtest form goes single-column.

Two rules drive the charts:

- **One axis, never two.** The overlay indexes both legs to 100 at the first
  shared bar rather than giving each its own price scale, because where two
  scales line up is an arbitrary choice that can make unrelated series look
  locked together. The spread gets its own panel for the same reason — σ and an
  index level are different quantities.
- **Colour never carries meaning alone.** Every chart has a legend and a table
  view, series are direct-labelled at their endpoints, the spread panel states
  the trade direction in words, and status colours always ship with a label.

## Layout

```
src/lib/
  universe.ts            instruments + the symbol each API knows them by, ETF proxies, RV watchlist
  stats.ts               correlation, OLS hedge ratio, spread, ADF, half-life, Hurst, scoring
  providers/
    index.ts             priority chain, health probes, proxy fallback, venue/cost index
    yahoo.ts  nasdaq.ts  twelvedata.ts  alphavantage.ts
    frankfurter.ts  hyperliquid.ts  coingecko.ts
    gains.ts  pyth.ts    venue metadata (perp listings, costs, sessions)
  limiter.ts             per-host spacing, retry with backoff, circuit breaker
  cache.ts               TTL cache with single-flight

  backtest.ts            walk-forward pair backtest: entries, exits, costs, equity, metrics

src/app/
  page.tsx               the dashboard
  docs/page.tsx          in-app help & docs
  api/health             provider reachability
  api/scan               fetch a universe, score every pair, build the correlation matrix
  api/candles            one pair aligned, indexed, with spread + rolling z
  api/backtest           run the backtest, return trades + equity + summary
  api/venues             perp listings and session state per instrument

src/components/
  Workspace.tsx          the app: sidebar + pair pane, tab state, data fetching
  AppShell.tsx           top bar, provider/market popover
  PairList.tsx           the sidebar — one scannable row per pair, with a ±3σ track
  PairHeader.tsx         the pair's name, headline figures, and the verdict
  FiltersPanel.tsx       collapsed scan setup
  OverlayChart.tsx  SpreadPanel.tsx     the two charts, one shared crosshair
  StatTiles.tsx  ExecutionCard.tsx  BacktestPanel.tsx  CorrHeatmap.tsx   the tabs
  DocsBody.tsx           the /docs page
  chart-kit.tsx          scales, axes, shared crosshair, formatters
```

Charts are hand-rolled SVG — no charting dependency — which is what makes one
crosshair drive two panels and keeps the marks on spec.

---

## Honest limitations

- **The scanner's β and z are in-sample** — fitted on the same window they are
  measured over, so they describe the past. The backtest is the walk-forward
  version; the scanner is not. A high score is a reason to investigate, not a
  signal.
- **The scanner's cost column is venue spread and fees only.** Funding,
  slippage and the borrow on the short leg are excluded there — only the
  backtest charges them. On a multi-day hold, funding usually dominates fees.
- **Testing hundreds of pairs finds some that look good by chance.** With ~700
  pairs tested, a handful clear any threshold on noise alone. This is why
  correlation stability and the ADF test carry the most weight in the score —
  and why a pair with an economic reason to co-move deserves more trust.
- **Bars are inner-joined, never forward-filled.** Correlating an open market
  against a closed one by carrying the last print creates correlation out of
  nothing. The cost is that cross-session pairs have fewer usable bars — the
  overlapping-bar count is shown on every chart.
- **Different sessions, different closes.** A daily FX bar and a daily US
  equity bar do not end at the same instant, so cross-class daily correlations
  carry a timing mismatch no amount of alignment removes.
- **ETF proxies are not the underlying.** See above; they are always labelled.
- **History is not adjusted for dividends or futures rolls** on every provider,
  which shows up as spurious jumps in the spread on roll dates.
- Nothing here is trade advice.
