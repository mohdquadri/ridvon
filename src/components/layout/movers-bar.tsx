import { useNavigate } from "@tanstack/react-router";
import { MOVER_UNIVERSE } from "@/lib/market/universe";
import { formatPercent } from "@/lib/market/format";
import { useQuotes } from "@/hooks/use-quotes";
import { cn } from "@/lib/utils";

export function MoversBar() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuotes(MOVER_UNIVERSE, {
    refetchInterval: 90_000,
    staleTime: 45_000,
  });

  const sorted = [...(data ?? [])].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter((q) => q.changePercent > 0).slice(0, 4);
  const losers = sorted.filter((q) => q.changePercent < 0).slice(-4).reverse();
  const mixed = [...gainers, ...losers];

  return (
    <div className="flex items-center gap-4 overflow-hidden border-b border-border bg-surface px-5 py-3 sm:px-7">
      <span className="shrink-0 border-r border-border pr-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
        S&P 500 Movers
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto ticker-scroll">
        {isLoading && mixed.length === 0 ? (
          <span className="text-xs italic text-subtle">Loading market movers…</span>
        ) : mixed.length === 0 ? (
          <span className="text-xs text-subtle">Movers unavailable</span>
        ) : (
          mixed.map((q) => (
            <button
              key={q.symbol}
              type="button"
              onClick={() =>
                void navigate({
                  to: "/analysis",
                  search: { ticker: q.symbol, tab: "analyze" },
                })
              }
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            >
              <span className="text-[13px] font-semibold text-fg">{q.symbol}</span>
              <span
                className={cn(
                  "text-[13px] font-semibold tabular",
                  q.changePercent >= 0 ? "text-gain" : "text-loss",
                )}
              >
                {formatPercent(q.changePercent)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
