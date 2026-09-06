import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDay, formatMarginPct, formatShares } from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { Fundamentals, InsiderTrade } from "@/lib/market/types";

function tonePct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n) || n === 0) return "text-fg";
  return n > 0 ? "text-gain" : "text-loss";
}

function kindLabel(kind: InsiderTrade["kind"]): string {
  if (kind === "buy") return "Buy";
  if (kind === "sell") return "Sell";
  if (kind === "grant") return "Grant";
  return "Other";
}

export function OwnershipCard({
  fundamentals,
  loading,
}: {
  fundamentals?: Fundamentals | null;
  loading?: boolean;
}) {
  const f = fundamentals;
  const trades = f?.insiderTrades ?? [];
  const hasSnap =
    f?.insiderOwnPct != null ||
    f?.instOwnPct != null ||
    f?.insiderTransPct != null ||
    f?.instTransPct != null;
  const hasFlow = (f?.insiderBuyShares ?? 0) + (f?.insiderSellShares ?? 0) > 0 || trades.length > 0;

  if (loading && !f) {
    return (
      <Card>
        <CardTitle className="mb-3">Ownership & Flow</CardTitle>
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }
  if (!hasSnap && !hasFlow) return null;

  const netSh = (f?.insiderBuyShares ?? 0) - (f?.insiderSellShares ?? 0);
  const netVal = (f?.insiderBuyValue ?? 0) - (f?.insiderSellValue ?? 0);
  const insiderBias =
    netSh > 0 ? "Net buying" : netSh < 0 ? "Net selling" : "Flat";
  const instBias =
    f?.instTransPct == null
      ? null
      : f.instTransPct > 0.2
        ? "Buying"
        : f.instTransPct < -0.2
          ? "Selling"
          : "Flat";

  const stats = [
    { k: "Insider own", v: formatMarginPct(f?.insiderOwnPct ?? null), n: f?.insiderOwnPct ?? null, signed: false },
    { k: "Insider 6M", v: formatMarginPct(f?.insiderTransPct ?? null), n: f?.insiderTransPct ?? null, signed: true },
    { k: "Inst own", v: formatMarginPct(f?.instOwnPct ?? null), n: f?.instOwnPct ?? null, signed: false },
    { k: "Inst quarter", v: formatMarginPct(f?.instTransPct ?? null), n: f?.instTransPct ?? null, signed: true },
  ];

  return (
    <Card>
      <CardTitle className="mb-3">Ownership & Flow</CardTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded-md bg-bg px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {s.k}
            </div>
            <div className={cn("mt-1 text-base font-bold tabular", s.signed ? tonePct(s.n) : "text-fg")}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Insiders · last 6 months
          </div>
          <div className={cn("mt-1 text-sm font-bold", tonePct(netSh))}>
            {insiderBias}
            {netSh !== 0 ? ` · ${netSh > 0 ? "+" : "−"}${formatShares(Math.abs(netSh))} sh` : ""}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            Buys {formatShares(f?.insiderBuyShares ?? 0)}
            {f?.insiderBuyValue ? ` (${formatCompact(f.insiderBuyValue)})` : ""}
            {" · "}
            Sells {formatShares(f?.insiderSellShares ?? 0)}
            {f?.insiderSellValue ? ` (${formatCompact(-Math.abs(f.insiderSellValue))})` : ""}
          </div>
        </div>
        <div className="rounded-md border border-border px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Institutions · latest 13F
          </div>
          <div className={cn("mt-1 text-sm font-bold", tonePct(f?.instTransPct ?? null))}>
            {instBias ? `${instBias}${f?.instTransPct != null ? ` · ${formatMarginPct(f.instTransPct)}` : ""}` : "—"}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {f?.instOwnPct != null
              ? `${formatMarginPct(f.instOwnPct)} of shares held by funds. Positive Inst Trans = net buying last quarter.`
              : "13F change is the latest quarterly fund flow."}
          </div>
        </div>
      </div>

      {trades.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Insider</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3 text-right">Shares</th>
                <th className="py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 8).map((t, i) => (
                <tr key={`${t.date}-${t.name}-${i}`} className="border-b border-border/70">
                  <td className="py-2 pr-3 tabular text-muted">{formatDay(t.date)}</td>
                  <td className="py-2 pr-3">
                    <div className="font-semibold">{t.name}</div>
                    {t.title ? <div className="text-[11px] text-subtle">{t.title}</div> : null}
                  </td>
                  <td
                    className={cn(
                      "py-2 pr-3 font-semibold",
                      t.kind === "buy" && "text-gain",
                      t.kind === "sell" && "text-loss",
                    )}
                  >
                    {kindLabel(t.kind)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular">{formatShares(t.shares)}</td>
                  <td
                    className={cn(
                      "py-2 text-right tabular",
                      t.kind === "buy" && "text-gain",
                      t.kind === "sell" && "text-loss",
                    )}
                  >
                    {t.value != null
                      ? formatCompact(t.kind === "sell" ? -Math.abs(t.value) : t.value)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}