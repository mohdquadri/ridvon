import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeText } from "@/components/change-pill";
import { useWatchlist } from "@/hooks/use-watchlist";
import { getTradeBoard } from "@/lib/market/api";
import { formatPrice, formatShares } from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { TradeSetup } from "@/lib/market/types";

export function TradeBoard() {
  const { symbols } = useWatchlist();
  const list = symbols.slice(0, 16);
  const board = useQuery({
    queryKey: ["trade-board", list.join(",")],
    queryFn: () => getTradeBoard({ data: { symbols: list } }),
    enabled: list.length > 0,
    staleTime: 45_000,
  });
  const navigate = useNavigate();
  const rows = board.data ?? [];

  return (
    <Card>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <CardTitle className="mb-0">Trade board</CardTitle>
          <p className="mt-1 text-sm text-muted">
            Watchlist ranked by right-now tape. Click a row for the call.
          </p>
        </div>
      </div>
      {board.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-subtle">No tape yet — add names to the watchlist.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="py-2 pr-3">Ticker</th>
                <th className="py-2 pr-3 text-right">Price</th>
                <th className="py-2 pr-3 text-right">Change</th>
                <th className="py-2 pr-3 text-right">RVOL</th>
                <th className="py-2 pr-3 text-right">Float</th>
                <th className="py-2 pr-3">Setup</th>
                <th className="py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.symbol}
                  className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-bg"
                  onClick={() =>
                    void navigate({ to: "/analysis", search: { ticker: r.symbol, tab: "trade" } })
                  }
                >
                  <td className="py-2.5 pr-3 font-bold">{r.symbol}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular">{formatPrice(r.price)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <ChangeText value={r.changePercent} />
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pr-3 text-right font-mono tabular",
                      r.rvol != null && r.rvol >= 2 && "font-bold text-primary",
                    )}
                  >
                    {r.rvol != null ? `${r.rvol.toFixed(1)}x` : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular">
                    {formatShares(r.floatShares)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <SetupChip setup={r.setup} />
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right font-mono text-base font-bold tabular",
                      r.score >= 75 && "text-gain",
                      r.score < 50 && "text-subtle",
                    )}
                  >
                    {r.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SetupChip({ setup }: { setup: TradeSetup }) {
  return (
    <span
      className={cn(
        "inline-block rounded-sm px-1.5 py-0.5 text-[12px] font-semibold",
        setup === "Breakout" && "bg-primary-soft text-primary",
        setup === "Momentum" && "bg-primary-soft text-primary",
        setup === "Trend" && "bg-bg text-fg",
        setup === "Reversal" && "bg-warning-soft text-warning",
        setup === "Chop" && "bg-bg text-subtle",
      )}
    >
      {setup}
    </span>
  );
}
