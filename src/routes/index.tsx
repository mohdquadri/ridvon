import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { MarketOverview } from "@/components/dashboard/market-overview";
import { TradeBoard } from "@/components/dashboard/trade-board";
import { TopMovers } from "@/components/dashboard/top-movers";
import { ToolGrid } from "@/components/dashboard/tool-grid";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <TradeBoard />
        <MarketOverview />
        <TopMovers />
        <ToolGrid />
      </div>
    </AppShell>
  );
}