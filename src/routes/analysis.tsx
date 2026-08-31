import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { StockAnalysis } from "@/components/analysis/stock-analysis";
import { TechnicalAnalysis } from "@/components/analysis/technical-analysis";
import { CatalystScanner } from "@/components/analysis/catalyst-scanner";
import { cn } from "@/lib/utils";
import type { AnalysisTab } from "@/lib/market/types";

type Search = { ticker: string; tab: AnalysisTab };

export const Route = createFileRoute("/analysis")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const ticker =
      typeof s.ticker === "string" ? s.ticker.toUpperCase().replace(/[^A-Z.]/g, "") : "";
    const tab: AnalysisTab =
      s.tab === "technical" || s.tab === "scanner" || s.tab === "analyze"
        ? s.tab
        : "analyze";
    return { ticker, tab };
  },
  component: AnalysisPage,
});

const TABS: { id: AnalysisTab; label: string }[] = [
  { id: "analyze", label: "Fundamentals" },
  { id: "technical", label: "Technical" },
  { id: "scanner", label: "Scanner" },
];

function AnalysisPage() {
  const { ticker, tab } = Route.useSearch();
  return (
    <AppShell sidebar={tab === "analyze"}>
      <div className="mb-5 overflow-hidden rounded-lg bg-ink">
        <div className="flex gap-0 overflow-x-auto border-b border-white/10">
          {TABS.map((t) => (
            <Link
              key={t.id}
              to="/analysis"
              search={{ ticker, tab: t.id }}
              className={cn(
                "px-6 py-3 text-[13px] font-medium no-underline transition-colors",
                tab === t.id
                  ? "border-b-2 border-primary bg-primary/10 text-primary-fg"
                  : "border-b-2 border-transparent text-ticker-muted hover:text-ticker-fg",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      {tab === "analyze" && <StockAnalysis initialTicker={ticker} />}
      {tab === "technical" && <TechnicalAnalysis initialTicker={ticker} />}
      {tab === "scanner" && <CatalystScanner initialTicker={ticker} />}
    </AppShell>
  );
}
