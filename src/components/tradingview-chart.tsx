import { useMemo } from "react";
import { cn } from "@/lib/utils";

const INTERVAL: Record<string, string> = {
  "5": "5",
  "15": "15",
  "60": "60",
  D: "D",
  W: "W",
};

export function TradingViewChart({
  symbol,
  interval = "D",
  theme = "light",
  studies = false,
  className,
}: {
  symbol: string;
  interval?: string;
  theme?: "light" | "dark";
  studies?: boolean;
  className?: string;
}) {
  const src = useMemo(() => {
    const params = new URLSearchParams({
      symbol,
      interval: INTERVAL[interval] ?? "D",
      hidedate: "0",
      hidesidetoolbar: "0",
      hidetoptoolbar: "0",
      symboledit: "1",
      saveimage: "0",
      toolbarbg: theme === "dark" ? "131722" : "f1f3f6",
      theme,
      style: "1",
      timezone: "America/New_York",
      withdateranges: "1",
      hideideas: "1",
      locale: "en",
    });
    if (studies) {
      params.set(
        "studies",
        ["RSI@tv-basicstudies", "MACD@tv-basicstudies", "MAExp@tv-basicstudies", "BB@tv-basicstudies", "MASimple@tv-basicstudies"].join(
          String.fromCharCode(31),
        ),
      );
    }
    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [symbol, interval, theme, studies]);

  return (
    <iframe
      title={`${symbol} chart`}
      src={src}
      className={cn("h-full w-full border-0", className)}
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
