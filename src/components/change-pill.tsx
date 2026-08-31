import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/market/format";

export function ChangePill({ value, className }: { value: number; className?: string }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-xs font-semibold tabular",
        up ? "bg-primary-soft text-gain" : "bg-danger-soft text-loss",
        className,
      )}
    >
      {formatPercent(value)}
    </span>
  );
}

export function ChangeText({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("font-semibold tabular", value >= 0 ? "text-gain" : "text-loss", className)}>
      {formatPercent(value)}
    </span>
  );
}
