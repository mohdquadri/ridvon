import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeText } from "@/components/change-pill";
import { KeyMetricsCard } from "@/components/analysis/key-metrics";
import { EarningsCard } from "@/components/analysis/earnings-card";
import { OwnershipCard } from "@/components/analysis/ownership-card";
import { getFundamentals, getHistory, getNews, getOwnership, getPeerStats } from "@/lib/market/api";
import { analyzeFundamentalsAi } from "@/lib/market/ai";
import { snapshotFromBars } from "@/lib/market/indicators";
import { COMPETITORS } from "@/lib/market/universe";
import {
  displayHeadline,
  formatCompact,
  formatMarginPct,
  formatPercent,
  formatPrice,
  formatRatio,
  formatVolume,
  timeAgo,
} from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { Fundamentals, GrokFundamental, HorizonCall } from "@/lib/market/types";

function fundamentalsLines(f: Fundamentals | undefined): string[] {
  if (!f) return [];
  const rows: Array<[string, string | null]> = [
    ["Market Cap", f.marketCap != null ? formatCompact(f.marketCap) : null],
    ["Enterprise Value", f.enterpriseValue != null ? formatCompact(f.enterpriseValue) : null],
    ["Revenue (TTM)", f.revenueTtm != null ? formatCompact(f.revenueTtm) : null],
    ["Free Cash Flow", f.freeCashFlow != null ? formatCompact(f.freeCashFlow) : null],
    ["Profit Margin", f.profitMargin != null ? formatMarginPct(f.profitMargin) : null],
    ["Operating Margin", f.operatingMargin != null ? formatMarginPct(f.operatingMargin) : null],
    ["Gross Margin", f.grossMargin != null ? formatMarginPct(f.grossMargin) : null],
    ["Trailing P/E", f.peTtm != null ? formatRatio(f.peTtm) : null],
    ["Forward P/E", f.forwardPe != null ? formatRatio(f.forwardPe) : null],
    ["P/S (TTM)", f.psTtm != null ? formatRatio(f.psTtm) : null],
    ["EV/EBITDA", f.evEbitda != null ? formatRatio(f.evEbitda) : null],
    ["EPS (ttm)", f.epsTtm != null ? formatRatio(f.epsTtm) : null],
    ["ROE", f.roe != null ? formatMarginPct(f.roe) : null],
    ["ROA", f.roa != null ? formatMarginPct(f.roa) : null],
    ["Current Ratio", f.currentRatio != null ? formatRatio(f.currentRatio) : null],
    ["Industry", f.sector || f.industry],
    [
      "Last EPS surprise",
      f.lastEpsSurprisePct != null
        ? `${f.lastEpsSurprisePct > 0 ? "+" : ""}${f.lastEpsSurprisePct.toFixed(1)}%` +
          (f.lastEarningsDate ? ` (${f.lastEarningsDate})` : "")
        : null,
    ],
    [
      "Next earnings",
      f.nextEarningsDate
        ? `${f.nextEarningsDate}${f.nextEarningsEst ? " est." : ""}`
        : null,
    ],
    ["Insider Own", f.insiderOwnPct != null ? `${f.insiderOwnPct.toFixed(2)}%` : null],
    [
      "Insider 6M change",
      f.insiderTransPct != null
        ? `${f.insiderTransPct > 0 ? "+" : ""}${f.insiderTransPct.toFixed(2)}%`
        : null,
    ],
    ["Institutional Own", f.instOwnPct != null ? `${f.instOwnPct.toFixed(2)}%` : null],
    [
      "Institutional last quarter",
      f.instTransPct != null
        ? `${f.instTransPct > 0 ? "+" : ""}${f.instTransPct.toFixed(2)}% (${f.instTransPct > 0 ? "net buying" : f.instTransPct < 0 ? "net selling" : "flat"})`
        : null,
    ],
    [
      "Insider Form 4 (6M)",
      f.insiderBuyShares + f.insiderSellShares > 0
        ? `buys ${f.insiderBuyShares.toLocaleString()} sh / sells ${f.insiderSellShares.toLocaleString()} sh (net ${f.insiderBuyShares - f.insiderSellShares > 0 ? "+" : ""}${(f.insiderBuyShares - f.insiderSellShares).toLocaleString()})`
        : null,
    ],
    ["Short Float", f.shortFloatPct != null ? `${f.shortFloatPct.toFixed(2)}%` : null],
  ];
  return rows
    .filter((row): row is [string, string] => Boolean(row[1]) && row[1] !== "N/A")
    .map(([k, v]) => `${k}: ${v}`);
}

function mergeFund(
  base: Fundamentals | undefined,
  own: Partial<Fundamentals> | undefined,
): Fundamentals | undefined {
  if (!base && !own) return undefined;
  const f = { ...(base as Fundamentals | undefined) };
  const o = own ?? {};
  return {
    marketCap: f?.marketCap ?? null,
    enterpriseValue: f?.enterpriseValue ?? null,
    revenueTtm: f?.revenueTtm ?? null,
    freeCashFlow: f?.freeCashFlow ?? null,
    sharesOutstanding: f?.sharesOutstanding ?? null,
    sharesFloat: o.sharesFloat ?? f?.sharesFloat ?? null,
    profitMargin: f?.profitMargin ?? null,
    operatingMargin: f?.operatingMargin ?? null,
    grossMargin: f?.grossMargin ?? null,
    evEbitda: f?.evEbitda ?? null,
    epsTtm: f?.epsTtm ?? null,
    peTtm: f?.peTtm ?? null,
    forwardPe: f?.forwardPe ?? null,
    psTtm: f?.psTtm ?? null,
    roe: f?.roe ?? null,
    roa: f?.roa ?? null,
    currentRatio: f?.currentRatio ?? null,
    industry: f?.industry ?? null,
    sector: f?.sector ?? null,
    exchange: f?.exchange ?? null,
    nextEarningsDate: f?.nextEarningsDate ?? o.nextEarningsDate ?? null,
    nextEarningsEst: f?.nextEarningsDate ? Boolean(f.nextEarningsEst) : Boolean(o.nextEarningsEst),
    lastEarningsDate: f?.lastEarningsDate ?? o.lastEarningsDate ?? null,
    lastEpsActual: f?.lastEpsActual ?? null,
    lastEpsEstimate: f?.lastEpsEstimate ?? null,
    lastEpsSurprisePct: f?.lastEpsSurprisePct ?? o.lastEpsSurprisePct ?? null,
    insiderOwnPct: o.insiderOwnPct ?? f?.insiderOwnPct ?? null,
    insiderTransPct: o.insiderTransPct ?? f?.insiderTransPct ?? null,
    instOwnPct: o.instOwnPct ?? f?.instOwnPct ?? null,
    instTransPct: o.instTransPct ?? f?.instTransPct ?? null,
    shortFloatPct: o.shortFloatPct ?? f?.shortFloatPct ?? null,
    shortRatio: o.shortRatio ?? f?.shortRatio ?? null,
    shortInterest: o.shortInterest ?? f?.shortInterest ?? null,
    relVolume: o.relVolume ?? f?.relVolume ?? null,
    insiderTrades: o.insiderTrades?.length ? o.insiderTrades : (f?.insiderTrades ?? []),
    insiderBuyShares: o.insiderBuyShares ?? f?.insiderBuyShares ?? 0,
    insiderSellShares: o.insiderSellShares ?? f?.insiderSellShares ?? 0,
    insiderBuyValue: o.insiderBuyValue ?? f?.insiderBuyValue ?? 0,
    insiderSellValue: o.insiderSellValue ?? f?.insiderSellValue ?? 0,
  };
}

export function StockAnalysis({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [active, setActive] = useState(initialTicker);
  const navigate = useNavigate();
  const wantAi = useRef(Boolean(initialTicker));

  useEffect(() => {
    if (initialTicker) {
      setTicker(initialTicker);
      setActive(initialTicker);
      wantAi.current = true;
    }
  }, [initialTicker]);

  const hist = useQuery({
    queryKey: ["history", active, "D"],
    queryFn: () => getHistory({ data: { symbol: active, interval: "D" } }),
    enabled: Boolean(active),
  });

  const news = useQuery({
    queryKey: ["news", active],
    queryFn: () => getNews({ data: { query: active, count: 12 } }),
    enabled: Boolean(active),
  });

  const fund = useQuery({
    queryKey: ["fundamentals", active],
    queryFn: () => getFundamentals({ data: { symbol: active } }),
    enabled: Boolean(active),
    staleTime: 5 * 60 * 1000,
  });

  const own = useQuery({
    queryKey: ["ownership", active],
    queryFn: () => getOwnership({ data: { symbol: active } }),
    enabled: Boolean(active),
    staleTime: 30 * 60 * 1000,
  });

  const fundamentals = useMemo(
    () => mergeFund(fund.data, own.data),
    [fund.data, own.data],
  );

  const spy = useQuery({
    queryKey: ["history", "SPY", "D"],
    queryFn: () => getHistory({ data: { symbol: "SPY", interval: "D" } }),
    enabled: Boolean(active),
    staleTime: 5 * 60 * 1000,
  });

  const snap = useMemo(() => {
    if (!hist.data || hist.data.bars.length < 26) return null;
    return snapshotFromBars(
      hist.data.bars,
      {
        price: hist.data.price,
        changePercent: hist.data.changePercent,
        volume: hist.data.volume,
        high52: hist.data.high52,
        low52: hist.data.low52,
      },
      { sessionVwap: false, interval: "D" },
    );
  }, [hist.data]);

  const levelLines = useMemo(() => {
    if (!snap) return [];
    const rows: string[] = [
      `Price ${snap.price.toFixed(2)}`,
      `Support ${snap.support.toFixed(2)} / Resistance ${snap.resistance.toFixed(2)}`,
      `EMA50 ${snap.ema50.toFixed(2)} / EMA200 ${snap.ema200.toFixed(2)}`,
      `RSI ${snap.rsi.toFixed(1)} (${snap.rsiZone})`,
    ];
    if (snap.atr != null) rows.push(`ATR ${snap.atr.toFixed(2)}`);
    if (snap.pdh != null && snap.pdl != null) rows.push(`PDH ${snap.pdh.toFixed(2)} / PDL ${snap.pdl.toFixed(2)}`);
    for (const lvl of snap.keyLevels.slice(0, 6)) {
      rows.push(`${lvl.kind === "resistance" ? "R" : "S"} ${lvl.price.toFixed(2)} ${lvl.strength}`);
    }
    if (snap.high52 != null) rows.push(`52w high ${snap.high52.toFixed(2)}`);
    if (snap.low52 != null) rows.push(`52w low ${snap.low52.toFixed(2)}`);
    return rows;
  }, [snap]);

  const ai = useMutation({
    mutationFn: () =>
      analyzeFundamentalsAi({
        data: {
          symbol: active,
          name: hist.data?.name ?? active,
          price: hist.data?.price ?? 0,
          changePercent: hist.data?.changePercent ?? 0,
          high52: hist.data?.high52 ?? null,
          low52: hist.data?.low52 ?? null,
          headlines: (news.data ?? []).slice(0, 8).map((n) => displayHeadline(n.title)),
          metrics: fundamentalsLines(fundamentals),
          levels: levelLines,
        },
      }),
  });

  const rivals = COMPETITORS[active] ?? [];
  const rivalQuotes = useQuery({
    queryKey: ["peer-stats", rivals.join(",")],
    queryFn: () => getPeerStats({ data: { symbols: rivals } }),
    enabled: rivals.length > 0 && Boolean(hist.data),
    staleTime: 5 * 60 * 1000,
  });

  function run() {
    const t = ticker.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (!t) return;
    wantAi.current = true;
    setActive(t);
    void navigate({ to: "/analysis", search: { ticker: t, tab: "analyze" }, replace: true });
  }

  useEffect(() => {
    if (
      !wantAi.current ||
      !hist.data ||
      !news.isFetched ||
      !fund.isFetched ||
      own.isFetching ||
      ai.isPending
    )
      return;
    wantAi.current = false;
    ai.mutate();
  }, [hist.data, news.isFetched, news.data, fund.isFetched, fund.data, own.isFetching, own.data, active, ai]);

  const h = hist.data;

  const analysis: GrokFundamental | null =
    ai.data && ai.data.ok ? ai.data.analysis : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Investor Mode</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          Fundamentals, valuation, earnings, and ownership — plus Grok short / swing / long calls.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Ticker Symbol
            </span>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
              placeholder="e.g. AAPL"
              className="uppercase"
            />
          </label>
          <Button onClick={run} className="sm:w-auto" disabled={hist.isFetching && Boolean(active)}>
            <LineChart className="size-4" /> Analyze Stock
          </Button>
        </div>
      </Card>

      {!active && (
        <Card className="py-16 text-center">
          <p className="text-sm text-muted">Enter a ticker to run analysis.</p>
        </Card>
      )}

      {active && hist.isLoading && (
        <Card>
          <Skeleton className="h-24 w-full" />
        </Card>
      )}

      {hist.isError && (
        <Card>
          <p className="text-sm text-danger">
            Could not load {active}. Check the symbol and try again.
          </p>
        </Card>
      )}

      {h && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Price" value={formatPrice(h.price)} />
            <Stat
              label="Change"
              value={formatPercent(h.changePercent)}
              tone={h.changePercent >= 0 ? "gain" : "loss"}
            />
            <Stat label="Volume" value={formatVolume(h.volume)} />
            <Stat label="Name" value={h.name} className="col-span-2 md:col-span-1" />
          </div>

          <EarningsCard fundamentals={fundamentals} loading={fund.isLoading && own.isLoading} />

          <KeyMetricsCard
            price={h.price}
            high52={h.high52}
            low52={h.low52}
            firstTradeDate={h.firstTradeDate}
            exchangeName={h.exchangeName}
            fullExchangeName={h.fullExchangeName}
            fundamentals={fundamentals}
            bars={h.bars}
            spyBars={spy.data?.bars}
            loading={fund.isLoading}
          />

          <OwnershipCard fundamentals={fundamentals} loading={own.isLoading} />

          <Card>
            <CardTitle className="mb-3">Grok AI Analysis</CardTitle>
            {ai.isPending && (
              <p className="text-sm text-muted">Grok is reading the tape…</p>
            )}
            {ai.data && !ai.data.ok && (
              <p className="text-sm text-muted">{ai.data.error}</p>
            )}
            {analysis && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Is it a buy?
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <HorizonCard title="Short term" hint="1–10 sessions" call={analysis.shortTerm} />
                    <HorizonCard title="Swing" hint="2–8 weeks" call={analysis.swing} />
                    <HorizonCard title="Long term" hint="6–18 months" call={analysis.longTerm} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                        <th className="py-2 pr-3">Lens</th>
                        <th className="py-2 pr-3">Read</th>
                        <th className="py-2">Take</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Valuation", analysis.valuation],
                          ["Growth", analysis.growth],
                          ["Risk", analysis.risks],
                        ] as const
                      ).map(([label, row]) => (
                        <tr key={label} className="border-b border-border/70 align-top">
                          <td className="py-2.5 pr-3 font-semibold text-muted">{label}</td>
                          <td className="py-2.5 pr-3 font-semibold">{row.metric}</td>
                          <td className="py-2.5 text-muted">{row.take}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Sentiment
                  </h3>
                  <p className="text-sm leading-relaxed text-fg">{analysis.sentiment}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Outlook
                  </h3>
                  <p className="text-sm leading-relaxed text-fg">{analysis.outlook}</p>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-3">Recent Headlines</CardTitle>
            {news.isLoading ? (
              <Skeleton className="h-24" />
            ) : (news.data ?? []).length === 0 ? (
              <p className="text-sm text-subtle">No recent headlines.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(news.data ?? []).slice(0, 8).map((n) => (
                  <li key={n.id}>
                    <a
                      href={n.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary underline decoration-primary/35 underline-offset-2 hover:decoration-primary"
                    >
                      {displayHeadline(n.title)}
                    </a>
                    <div className="text-[11px] text-subtle">
                      {n.publisher} · {timeAgo(n.publishedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {rivals.length > 0 && (
            <Card>
              <CardTitle className="mb-3">Top Competitors</CardTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                      <th className="py-2">Ticker</th>
                      <th className="py-2">Price</th>
                      <th className="py-2">Change</th>
                      <th className="py-2">P/E</th>
                      <th className="py-2">Fwd P/E</th>
                      <th className="py-2">P/S</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rivalQuotes.data ?? []).map((q) => (
                      <tr key={q.symbol} className="border-b border-border/70">
                        <td className="py-2">
                          <button
                            type="button"
                            className="font-semibold text-primary"
                            onClick={() => {
                              wantAi.current = true;
                              setTicker(q.symbol);
                              setActive(q.symbol);
                              void navigate({
                                to: "/analysis",
                                search: { ticker: q.symbol, tab: "analyze" },
                              });
                            }}
                          >
                            {q.symbol}
                          </button>
                        </td>
                        <td className="py-2 tabular">{formatPrice(q.price)}</td>
                        <td className="py-2">
                          <ChangeText value={q.changePercent} />
                        </td>
                        <td className="py-2 tabular">{formatRatio(q.peTtm)}</td>
                        <td className="py-2 tabular">{formatRatio(q.forwardPe)}</td>
                        <td className="py-2 tabular">{formatRatio(q.psTtm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border bg-surface p-4", className)}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div
        className={cn(
          "truncate text-xl font-bold tabular",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function actionTone(action: string): "gain" | "loss" | "wait" {
  const a = action.toLowerCase();
  if (/\bbuy\b|\badd\b|\baccumul/.test(a)) return "gain";
  if (/\btrim\b|\bsell\b|\bavoid\b|\bshort\b/.test(a)) return "loss";
  return "wait";
}

function HorizonCard({
  title,
  hint,
  call,
}: {
  title: string;
  hint: string;
  call: HorizonCall;
}) {
  const tone = actionTone(call.action);
  return (
    <div className="rounded-md border border-border bg-bg px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            {title}
          </div>
          <div className="text-[11px] text-subtle">{hint}</div>
        </div>
        <span
          className={cn(
            "rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
            tone === "gain" && "bg-primary-soft text-gain",
            tone === "loss" && "bg-danger-soft text-loss",
            tone === "wait" && "bg-warning-soft text-warning",
          )}
        >
          {call.action}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-subtle">Entry</dt>
          <dd className="font-mono font-semibold tabular">{call.entry}</dd>
        </div>
        <div>
          <dt className="text-subtle">Stop</dt>
          <dd className="font-mono font-semibold tabular">{call.stop}</dd>
        </div>
        <div>
          <dt className="text-subtle">Target</dt>
          <dd className="font-mono font-semibold tabular">{call.target}</dd>
        </div>
      </dl>
      {call.take ? <p className="mt-2 text-xs leading-relaxed text-muted">{call.take}</p> : null}
    </div>
  );
}
