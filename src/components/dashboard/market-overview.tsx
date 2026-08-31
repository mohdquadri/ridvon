import { useNavigate } from "@tanstack/react-router";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/sparkline";
import { ChangeText } from "@/components/change-pill";
import { OVERVIEW } from "@/lib/market/universe";
import { formatPrice } from "@/lib/market/format";
import { useQuotes } from "@/hooks/use-quotes";

const SYMBOLS = OVERVIEW.map((o) => o.symbol);

export function MarketOverview() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuotes(SYMBOLS);
  const bySym = new Map((data ?? []).map((q) => [q.symbol, q]));

  return (
    <Card>
      <CardTitle className="mb-4">Market Overview</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {OVERVIEW.map((item) => {
          const q = bySym.get(item.symbol);
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() =>
                void navigate({
                  to: "/analysis",
                  search: { ticker: item.symbol, tab: "analyze" },
                })
              }
              className="rounded-md border border-border p-3.5 text-left transition-shadow hover:border-primary/40 hover:shadow-sm"
            >
              <div className="text-[15px] font-semibold">{item.symbol}</div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle">
                {item.name}
              </div>
              {isLoading && !q ? (
                <>
                  <Skeleton className="mb-1 h-6 w-20" />
                  <Skeleton className="h-4 w-12" />
                </>
              ) : q ? (
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold tabular leading-tight">
                      {formatPrice(q.price)}
                    </div>
                    <ChangeText value={q.changePercent} className="text-sm" />
                  </div>
                  <Sparkline values={q.sparkline} positive={q.changePercent >= 0} />
                </div>
              ) : (
                <div className="text-sm text-subtle">No data</div>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
