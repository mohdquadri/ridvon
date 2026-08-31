import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDesc, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TradingViewChart } from "@/components/tradingview-chart";

const DEFAULTS = ["AAPL", "TSLA", "NVDA", "MSFT"];

export function MultiChart() {
  const [draft, setDraft] = useState(DEFAULTS);
  const [live, setLive] = useState(DEFAULTS);
  return (
    <Card>
      <CardTitle>Multi-Chart View</CardTitle>
      <CardDesc>Four TradingView charts side by side. Change a symbol and reload.</CardDesc>
      <div className="mb-4 mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {draft.map((s, i) => (
          <label key={i}>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">Chart {i + 1}</span>
            <Input value={s} onChange={(e) => { const next = [...draft]; next[i] = e.target.value.toUpperCase(); setDraft(next); }} onKeyDown={(e) => { if (e.key === "Enter") setLive([...draft]); }} className="uppercase" />
          </label>
        ))}
      </div>
      <Button className="mb-4 w-full" onClick={() => setLive([...draft])}>
        <RefreshCw className="size-4" /> Load Charts
      </Button>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {live.map((symbol, i) => (
          <div key={`${symbol}-${i}`} className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center justify-between border-b border-border bg-bg px-3 py-2">
              <span className="text-sm font-semibold">{symbol || `Chart ${i + 1}`}</span>
              <span className="text-[11px] text-subtle">TradingView</span>
            </div>
            <div className="h-[420px] bg-surface">
              {symbol ? <TradingViewChart symbol={symbol} interval="D" /> : <div className="flex h-full items-center justify-center text-sm text-subtle">Enter a symbol</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
