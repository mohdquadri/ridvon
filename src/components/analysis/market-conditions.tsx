import { Card, CardTitle } from "@/components/ui/card";
import { MARKET_CONFIRM, marketTone, sectorEtf } from "@/lib/market/trade";
import { cn } from "@/lib/utils";
import type { Quote } from "@/lib/market/types";

export function MarketConditions({
  quotes,
  ticker,
  sector,
  industry,
}: {
  quotes: Quote[];
  ticker?: string;
  sector?: string | null;
  industry?: string | null;
}) {
  const by = new Map(quotes.map((q) => [q.symbol, q]));
  const theme = sectorEtf(sector ?? null, industry ?? null);
  const themeQ = by.get(theme.symbol);
  const themeTone = themeQ ? marketTone(themeQ.changePercent) : "flat";
  const themeLabel =
    themeTone === "up" ? "Strong" : themeTone === "down" ? "Weak" : "Mixed";
  const name = ticker?.trim() ? ticker.trim().toUpperCase() : "Name";

  return (
    <Card>
      <CardTitle className="mb-3">Market Conditions</CardTitle>
      <div className="flex flex-col gap-2.5">
        {MARKET_CONFIRM.map((m) => {
          const q = by.get(m.symbol);
          const tone = q ? marketTone(q.changePercent) : "flat";
          return (
            <div key={m.symbol} className="flex items-center gap-2.5 text-sm">
              <span className="w-10 font-semibold">{m.label}</span>
              <Dot tone={tone} />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">
          {name} Sector/Theme
          {theme.label !== "Market" ? ` (${theme.label})` : ""}:
        </span>
        <Dot tone={themeTone} />
        <span
          className={cn(
            "font-semibold",
            themeTone === "up" && "text-gain",
            themeTone === "down" && "text-loss",
          )}
        >
          {themeLabel}
        </span>
      </div>
    </Card>
  );
}

function Dot({ tone }: { tone: "up" | "flat" | "down" }) {
  return (
    <span
      className={cn(
        "inline-block size-3 rounded-full",
        tone === "up" && "bg-gain",
        tone === "down" && "bg-loss",
        tone === "flat" && "bg-warning",
      )}
    />
  );
}
