import { Card } from "@/components/ui/card";
import { formatPrice } from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { GrokTradeCall } from "@/lib/market/types";

export function DecisionCard({
  call,
  loading,
}: {
  call: GrokTradeCall | null;
  loading?: boolean;
}) {
  if (loading && !call) {
    return (
      <Card className="border-primary/20">
        <p className="text-sm text-muted">Grok is deciding if this is a trade…</p>
      </Card>
    );
  }
  if (!call) return null;

  const go = call.tradeable;
  const tone =
    call.bias === "BULLISH" ? "gain" : call.bias === "BEARISH" ? "loss" : "wait";
  const headline = go
    ? `TRADEABLE — ${call.bias}`
    : call.bias === "NEUTRAL"
      ? "WAIT — NO EDGE"
      : `NOT TRADEABLE — ${call.bias}`;

  const target =
    call.target2 != null
      ? `${formatPrice(call.target)} / ${formatPrice(call.target2)}`
      : formatPrice(call.target);

  return (
    <Card
      className={cn(
        "border-2",
        tone === "gain" && "border-primary/40 bg-primary-soft/40",
        tone === "loss" && "border-danger/40 bg-danger-soft/40",
        tone === "wait" && "border-warning/40 bg-warning-soft/40",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "size-3 rounded-full",
            tone === "gain" && "bg-gain",
            tone === "loss" && "bg-loss",
            tone === "wait" && "bg-warning",
          )}
        />
        <h2
          className={cn(
            "text-xl font-bold tracking-tight",
            tone === "gain" && "text-gain",
            tone === "loss" && "text-loss",
            tone === "wait" && "text-warning",
          )}
        >
          {headline}
        </h2>
      </div>
      <dl className="mt-4 space-y-1.5 text-[15px]">
        <Line k="Setup" v={call.setup} />
        <Line k="Confidence" v={`${call.confidence}%`} />
        <Line k="Entry" v={formatPrice(call.entry)} />
        <Line k="Stop" v={formatPrice(call.stop)} />
        <Line k="Target" v={target} />
        <Line k="R:R" v={`1:${call.rr.toFixed(1)}`} />
      </dl>
      <p className="mt-4 text-sm leading-relaxed">
        <span className="font-semibold">Best confirmation: </span>
        <span className="text-muted">{call.confirm}</span>
      </p>
      <p className="mt-1.5 text-sm leading-relaxed">
        <span className="font-semibold">Avoid if: </span>
        <span className="text-muted">{call.avoid}</span>
      </p>
      {call.note ? <p className="mt-3 text-sm text-muted">{call.note}</p> : null}
    </Card>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="font-semibold">{k}:</dt>
      <dd className="font-mono tabular">{v}</dd>
    </div>
  );
}
