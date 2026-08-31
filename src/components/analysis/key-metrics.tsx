import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatIpoDate,
  formatMarginPct,
  formatMetricNumber,
  formatPrice,
  formatRatio,
  formatShares,
} from "@/lib/market/format";
import { computeBeta } from "@/lib/market/indicators";
import { formatExchange } from "@/lib/market/universe";
import { cn } from "@/lib/utils";
import type { Bar, Fundamentals } from "@/lib/market/types";

type MetricItem = {
  k: string;
  v: string;
  tone?: "gain" | "loss";
};

function toneFor(value: string): "gain" | "loss" | undefined {
  if (!value || value === "N/A" || value === "—") return undefined;
  if (value.startsWith("-") && value !== "--") return "loss";
  if (value.endsWith("%")) {
    const n = parseFloat(value);
    if (!Number.isNaN(n) && n > 0) return "gain";
    if (!Number.isNaN(n) && n < 0) return "loss";
  }
  return undefined;
}

function item(k: string, v: string): MetricItem {
  return { k, v, tone: toneFor(v) };
}

export function KeyMetricsCard({
  price,
  high52,
  low52,
  firstTradeDate,
  exchangeName,
  fullExchangeName,
  fundamentals,
  bars,
  spyBars,
  loading,
}: {
  price: number;
  high52: number | null;
  low52: number | null;
  firstTradeDate: number | null;
  exchangeName: string | null;
  fullExchangeName: string | null;
  fundamentals?: Fundamentals | null;
  bars?: Bar[];
  spyBars?: Bar[];
  loading?: boolean;
}) {
  const fromHigh =
    high52 && price ? ((price - high52) / high52) * 100 : null;
  const fromLow = low52 && price ? ((price - low52) / low52) * 100 : null;

  const f = fundamentals;
  const shares = f?.sharesOutstanding ?? null;
  const liveMarketCap =
    shares !== null && price ? shares * price : (f?.marketCap ?? null);
  const liveEV =
    f?.enterpriseValue != null && f.marketCap != null && liveMarketCap != null
      ? f.enterpriseValue + (liveMarketCap - f.marketCap)
      : (f?.enterpriseValue ?? null);

  const beta = computeBeta(bars, spyBars);
  const industry = f?.sector || f?.industry || null;
  const exchange =
    formatExchange(exchangeName, fullExchangeName) || f?.exchange || null;

  const peTtm =
    f?.epsTtm != null && f.epsTtm > 0 && price ? price / f.epsTtm : (f?.peTtm ?? null);
  const psTtm =
    liveMarketCap != null && f?.revenueTtm != null && f.revenueTtm > 0
      ? liveMarketCap / f.revenueTtm
      : (f?.psTtm ?? null);

  const items: MetricItem[] = [
    item("Market Cap", formatMetricNumber(liveMarketCap)),
    item("Enterprise Value", formatMetricNumber(liveEV)),
    item("Revenue (TTM)", formatMetricNumber(f?.revenueTtm ?? null)),
    item("Free Cash Flow", formatMetricNumber(f?.freeCashFlow ?? null)),
    item("Trailing P/E", formatRatio(peTtm)),
    item("Forward P/E", formatRatio(f?.forwardPe ?? null)),
    item("P/S (TTM)", formatRatio(psTtm)),
    item("EV/EBITDA", formatRatio(f?.evEbitda ?? null)),
    item("52-Week High", high52 != null ? formatPrice(high52) : "N/A"),
    item("52-Week Low", low52 != null ? formatPrice(low52) : "N/A"),
    item("Current Price", formatPrice(price)),
    item("% from 52W High", fromHigh !== null ? formatMarginPct(fromHigh) : "N/A"),
    item("% from 52W Low", fromLow !== null ? formatMarginPct(fromLow) : "N/A"),
    item("Shares Outstanding", formatShares(shares)),
    item("Shares Float", formatShares(f?.sharesFloat ?? null)),
    item("Profit Margin", formatMarginPct(f?.profitMargin ?? null)),
    item("Operating Margin", formatMarginPct(f?.operatingMargin ?? null)),
    item("Gross Margin", formatMarginPct(f?.grossMargin ?? null)),
    item("EPS (ttm)", f?.epsTtm == null ? "N/A" : formatRatio(f.epsTtm)),
    item("ROE", formatMarginPct(f?.roe ?? null)),
    item("ROA", formatMarginPct(f?.roa ?? null)),
    item("Current Ratio", formatRatio(f?.currentRatio ?? null)),
    item("Beta", formatRatio(beta)),
    item("IPO Date", formatIpoDate(firstTradeDate)),
    item("Industry", industry ?? "N/A"),
    item("Exchange", exchange ?? "N/A"),
  ];

  return (
    <Card>
      <CardTitle className="mb-3">Key Metrics</CardTitle>
      {loading && !f ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((m, i) => (
            <div
              key={m.k}
              className={cn(
                "flex items-center justify-between gap-2 border-b border-border py-2",
                "sm:px-3 sm:odd:pl-0",
                "xl:px-3 xl:odd:pl-3",
                (i + 1) % 4 === 1 && "xl:pl-0",
                (i + 1) % 4 !== 0 && "xl:border-r xl:pr-3",
              )}
            >
              <span className="shrink-0 text-[11px] font-medium text-muted">
                {m.k}
              </span>
              <span
                className={cn(
                  "min-w-0 text-right text-[13px] font-bold leading-snug break-words tabular",
                  m.tone === "gain" && "text-gain",
                  m.tone === "loss" && "text-loss",
                )}
              >
                {m.v}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


