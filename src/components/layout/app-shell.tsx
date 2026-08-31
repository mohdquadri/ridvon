import type { ReactNode } from "react";
import { Header } from "./header";
import { TickerBar } from "./ticker-bar";
import { MoversBar } from "./movers-bar";
import { WatchlistPanel } from "./watchlist-panel";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  sidebar = true,
}: {
  children: ReactNode;
  sidebar?: boolean;
}) {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <Header />
      <TickerBar />
      <MoversBar />
      <div
        className={cn(
          "mx-auto grid w-full gap-5 px-4 py-5 sm:px-7 sm:py-6",
          sidebar ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1",
        )}
      >
        <main className="min-w-0">{children}</main>
        {sidebar ? (
          <aside className="min-w-0">
            <div className="lg:sticky lg:top-24">
              <WatchlistPanel />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
