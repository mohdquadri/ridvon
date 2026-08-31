import { useNavigate } from "@tanstack/react-router";
import { CRYPTO_TICKERS, INDEX_TICKERS } from "@/lib/market/universe";
import { formatPercent, formatPrice, marketSession } from "@/lib/market/format";
import type { Quote } from "@/lib/market/types";
import { useQuotes } from "@/hooks/use-quotes";
import { cn } from "@/lib/utils";

const ALL = [
  ...INDEX_TICKERS.map((t) => t.symbol),
  ...CRYPTO_TICKERS.map((t) => t.symbol),
];

function Item({
  label,
  quote,
  onClick,
}: {
  label: string;
  quote?: Quote;
  onClick?: () => void;
}) {
  const up = (quote?.changePercent ?? 0) >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[160px] items-center gap-3 text-left",
        onClick && "transition-opacity hover:opacity-80",
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ticker-muted">
        {label}
      </span>
      <span className="font-mono text-base font-bold tabular text-ticker-fg">
        {quote ? formatPrice(quote.price) : "—"}
      </span>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 font-mono text-xs font-semibold tabular",
          quote
            ? up
              ? "bg-gain/15 text-gain"
              : "bg-loss/15 text-loss"
            : "text-ticker-muted",
        )}
      >
        {quote ? formatPercent(quote.changePercent) : "—"}
      </span>
    </button>
  );
}

export function TickerBar() {
  const navigate = useNavigate();
  const session = marketSession();
  const { data } = useQuotes(ALL);
  const bySym = new Map((data ?? []).map((q) => [q.symbol, q]));

  function go(symbol: string) {
    void navigate({ to: "/analysis", search: { ticker: symbol, tab: "analyze" } });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 bg-ticker px-5 py-3 sm:px-7">
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5">
        <span
          className={cn(
            "size-2 rounded-full",
            session.open ? "bg-gain shadow-[0_0_0_4px_rgb(0_166_126_/_0.25)]" : "bg-loss",
          )}
        />
        <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-ticker-fg/80">
          {session.label}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-8 gap-y-2">
        {INDEX_TICKERS.map((t) => (
          <Item
            key={t.symbol}
            label={t.label}
            quote={bySym.get(t.symbol)}
            onClick={() => go(t.symbol)}
          />
        ))}
        <span className="hidden h-7 w-px shrink-0 bg-ticker-fg/15 lg:block" />
        {CRYPTO_TICKERS.map((t) => (
          <Item
            key={t.symbol}
            label={t.label}
            quote={bySym.get(t.symbol)}
            onClick={() => go(t.symbol)}
          />
        ))}
      </div>
    </div>
  );
}
