import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { daysUntil, formatDay, formatRatio } from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { Fundamentals } from "@/lib/market/types";

export function EarningsCard({
  fundamentals,
  loading,
}: {
  fundamentals?: Fundamentals | null;
  loading?: boolean;
}) {
  const f = fundamentals;
  const next = f?.nextEarningsDate ?? null;
  const last = f?.lastEarningsDate ?? null;
  const days = daysUntil(next);
  const surprise = f?.lastEpsSurprisePct ?? null;
  const beat = surprise != null && surprise > 0;
  const miss = surprise != null && surprise < 0;

  if (loading && !f) {
    return (
      <Card>
        <CardTitle className="mb-3">Earnings</CardTitle>
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  if (!next && !last) return null;

  return (
    <Card>
      <CardTitle className="mb-3">Earnings</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-bg px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Next report
          </div>
          <div className="mt-1 text-lg font-bold tabular">{formatDay(next)}</div>
          <div className="mt-0.5 text-xs text-muted">
            {next
              ? `${f?.nextEarningsEst ? "Est. " : ""}${
                  days == null
                    ? ""
                    : days === 0
                      ? "today"
                      : days > 0
                        ? `in ${days}d`
                        : `${Math.abs(days)}d ago`
                }`.trim()
              : "Not published"}
          </div>
        </div>
        <div className="rounded-md bg-bg px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Last surprise
          </div>
          <div
            className={cn(
              "mt-1 text-lg font-bold tabular",
              beat && "text-gain",
              miss && "text-loss",
            )}
          >
            {surprise == null
              ? "—"
              : `${beat ? "Beat" : miss ? "Miss" : "Inline"} ${surprise > 0 ? "+" : ""}${surprise.toFixed(1)}%`}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {last ? formatDay(last) : "—"}
            {f?.lastEpsActual != null && f.lastEpsEstimate != null
              ? ` · EPS ${formatRatio(f.lastEpsActual)} vs ${formatRatio(f.lastEpsEstimate)}`
              : ""}
          </div>
        </div>
      </div>
    </Card>
  );
}
