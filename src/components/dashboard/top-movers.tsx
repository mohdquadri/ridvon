import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MOVER_UNIVERSE } from "@/lib/market/universe";
import { formatPercent, formatPrice } from "@/lib/market/format";
import type { Quote } from "@/lib/market/types";
import { useQuotes } from "@/hooks/use-quotes";
import { cn } from "@/lib/utils";

export function TopMovers() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuotes(MOVER_UNIVERSE, {
    refetchInterval: 90_000,
    staleTime: 45_000,
  });

  const sorted = [...(data ?? [])].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter((q) => q.changePercent > 0).slice(0, 5);
  const losers = sorted.filter((q) => q.changePercent < 0).slice(-5).reverse();

  function go(symbol: string) {
    void navigate({ to: "/analysis", search: { ticker: symbol, tab: "analyze" } });
  }

  return (
    <Card>
      <CardTitle className="mb-5">Top Movers</CardTitle>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Column
          title="Top Gainers"
          icon={<TrendingUp className="size-4" />}
          items={gainers}
          tone="gain"
          loading={isLoading}
          onPick={go}
        />
        <Column
          title="Top Losers"
          icon={<TrendingDown className="size-4" />}
          items={losers}
          tone="loss"
          loading={isLoading}
          onPick={go}
        />
      </div>
    </Card>
  );
}

function Column({
  title,
  icon,
  items,
  tone,
  loading,
  onPick,
}: {
  title: string;
  icon: ReactNode;
  items: Quote[];
  tone: "gain" | "loss";
  loading: boolean;
  onPick: (symbol: string) => void;
}) {
  return (
    <div>
      <h3
        className={cn(
          "mb-3 flex items-center gap-2 text-sm font-semibold",
          tone === "gain" ? "text-gain" : "text-loss",
        )}
      >
        {icon}
        {title}
      </h3>
      <div className="flex flex-col gap-2">
        {loading && items.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))
          : items.map((q) => (
              <button
                key={q.symbol}
                type="button"
                onClick={() => onPick(q.symbol)}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <div>
                  <div className="text-sm font-semibold">{q.symbol}</div>
                  <div className="text-[11px] text-subtle">{q.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular">{formatPrice(q.price)}</div>
                  <div
                    className={cn(
                      "text-[13px] font-semibold tabular",
                      q.changePercent >= 0 ? "text-gain" : "text-loss",
                    )}
                  >
                    {formatPercent(q.changePercent)}
                  </div>
                </div>
              </button>
            ))}
        {!loading && items.length === 0 && (
          <div className="py-6 text-center text-sm text-subtle">No data available</div>
        )}
      </div>
    </div>
  );
}
