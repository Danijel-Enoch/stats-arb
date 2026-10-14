"use client";

import { fmt } from "./chart-kit";
import type { PairResponse } from "@/lib/client-types";
import type { VenueListing } from "@/lib/types";

export interface VenuesResponse {
  sessions: Record<string, boolean>;
  gainsRefreshed?: string;
  errors: string[];
  instruments: { id: string; name: string; cls: string; listings: VenueListing[] }[];
}

const VENUE_LABEL: Record<string, string> = {
  gtrade: "gTrade",
  hyperliquid: "Hyperliquid",
};

/**
 * A pair is only interesting if both legs can actually be put on. This is the
 * execution side of the same pair the charts are showing: where each leg is
 * listed, what the round trip costs, how much leverage the venue allows, and
 * whether that market is open right now.
 */
export default function ExecutionCard({
  data,
  venues,
}: {
  data: PairResponse;
  venues: VenuesResponse | null;
}) {
  const legs = [
    { leg: data.a, color: "var(--series-1)" },
    { leg: data.b, color: "var(--series-2)" },
  ];

  const find = (id: string) => venues?.instruments.find((i) => i.id === id)?.listings ?? [];
  const beta = Math.abs(data.stat?.beta ?? 1);

  return (
    <section aria-labelledby="exec-title">
      <header className="mb-3">
        <h2 id="exec-title" className="sr-only">
          Execution
        </h2>
        <p className="text-[12.5px] text-[var(--text-muted)]">
          Where each leg is perp-listed, at the venue&rsquo;s own posted spread, fees and leverage cap.
          Leg B is sized at β = {fmt.num(beta, 2)}× leg A.
        </p>
      </header>

      <div className="scroll-x">
        <table className="grid-table">
          <caption className="sr-only">Perp listings for both legs of the selected pair</caption>
          <thead>
            <tr>
              <th scope="col">Leg</th>
              <th scope="col">Venue</th>
              <th scope="col">Symbol</th>
              <th scope="col">Round trip</th>
              <th scope="col">Carry / h</th>
              <th scope="col">Max lev</th>
              <th scope="col">Market</th>
            </tr>
          </thead>
          <tbody>
            {legs.flatMap(({ leg, color }) => {
              const listings = find(leg.id);
              if (!listings.length) {
                return [
                  <tr key={leg.id}>
                    <td>
                      <LegName id={leg.id} color={color} />
                    </td>
                    <td colSpan={6} className="text-left text-[var(--text-muted)]">
                      Not perp-listed on any venue the app tracks — this leg would have to be hedged in the
                      underlying.
                    </td>
                  </tr>,
                ];
              }
              return listings.map((l, k) => (
                <tr key={`${leg.id}-${l.venue}`}>
                  <td>{k === 0 ? <LegName id={leg.id} color={color} /> : ""}</td>
                  <td>{VENUE_LABEL[l.venue] ?? l.venue}</td>
                  <td className="tnum">{l.symbol}</td>
                  <td className="tnum">{fmt.bps(l.costBps)}</td>
                  <td
                    className="tnum"
                    style={{
                      color:
                        l.carryBpsPerHour === undefined
                          ? "var(--text-muted)"
                          : l.carryBpsPerHour > 0
                            ? "var(--div-pos)"
                            : "var(--div-neg)",
                    }}
                  >
                    {l.carryBpsPerHour === undefined ? "—" : `${fmt.signed(l.carryBpsPerHour, 3)} bps`}
                  </td>
                  <td className="tnum">{l.maxLeverage ? `${fmt.num(l.maxLeverage, 0)}×` : "—"}</td>
                  <td>
                    {l.marketOpen === undefined ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: l.marketOpen ? "var(--good)" : "var(--text-muted)",
                          }}
                        />
                        {l.marketOpen ? "open" : "closed"}
                        {l.note ? <span className="text-[var(--text-muted)]"> · {l.note}</span> : null}
                      </span>
                    )}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {data.stat && (
        <p className="mt-3 border-t pt-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)] hair">
          At {fmt.signed(data.stat.zRolling)}σ the spread is worth{" "}
          <strong className="text-[var(--text-primary)]">{fmt.bps(data.stat.edgeBps)}</strong> if it returns to
          its mean
          {data.stat.halfLifeHours !== null && (
            <>
              , which the half-life puts at roughly{" "}
              {data.stat.halfLifeHours >= 48
                ? `${fmt.num(data.stat.halfLifeHours / 24, 0)} days`
                : `${fmt.num(data.stat.halfLifeHours, 0)} hours`}
            </>
          )}
          . Both legs round-trip for{" "}
          <strong className="text-[var(--text-primary)]">{fmt.bps(data.stat.costBps)}</strong>, leaving{" "}
          <strong style={{ color: (data.stat.netBps ?? 0) > 0 ? "var(--good-text)" : "var(--text-primary)" }}>
            {fmt.bps(data.stat.netBps)}
          </strong>{" "}
          before funding and slippage.
        </p>
      )}
    </section>
  );
}

function LegName({ id, color }: { id: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {id}
    </span>
  );
}
