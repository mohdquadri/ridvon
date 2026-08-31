import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { scanCatalysts } from "@/lib/market/api";
import { CATALYST_GROUPS, type CatalystCategory } from "@/lib/market/universe";
import { timeAgo } from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/lib/market/types";

const CHIP: Record<CatalystCategory, string> = {
  earn: "border-warning/40 bg-warning-soft text-warning",
  fda: "border-primary/40 bg-primary-soft text-primary",
  deal: "border-border bg-bg text-fg",
  ma: "border-border bg-bg text-fg",
  macro: "border-border bg-bg text-muted",
  ai: "border-primary/30 bg-primary-soft text-primary",
  viral: "border-danger/40 bg-danger-soft text-danger",
};

export function CatalystScanner({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [windowDays, setWindowDays] = useState("1");
  const [max, setMax] = useState(20);
  const [on, setOn] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of CATALYST_GROUPS) for (const k of g.keywords) init[k] = true;
    return init;
  });
  const navigate = useNavigate();

  const activeKeywords = useMemo(
    () => Object.entries(on).filter(([, v]) => v).map(([k]) => k),
    [on],
  );

  const scan = useMutation({
    mutationFn: () =>
      scanCatalysts({
        data: {
          ticker: ticker.trim().toUpperCase(),
          keywords: activeKeywords,
          max,
        },
      }),
  });

  function toggle(keyword: string) {
    setOn((prev) => ({ ...prev, [keyword]: !prev[keyword] }));
  }

  function setSection(id: CatalystCategory, value: boolean) {
    const g = CATALYST_GROUPS.find((x) => x.id === id);
    if (!g) return;
    setOn((prev) => {
      const next = { ...prev };
      for (const k of g.keywords) next[k] = value;
      return next;
    });
  }

  const items: NewsItem[] = scan.data ?? [];
  const cutoff = Date.now() / 1000 - Number(windowDays) * 86400;
  const visible = items.filter((n) => n.publishedAt >= cutoff);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Catalyst Scanner</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          Live news scan across corporate, healthcare, M&A, and AI keywords.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Stock Symbol (optional)
            </span>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              className="uppercase"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Time Window
            </span>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value="0.042">Last Hour</option>
              <option value="0.25">Last 6 Hours</option>
              <option value="1">Last 24 Hours</option>
              <option value="3">Last 3 Days</option>
              <option value="7">Last 7 Days</option>
              <option value="14">Last 2 Weeks</option>
              <option value="30">Last Month</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Max Results
            </span>
            <select
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value={10}>10 Results</option>
              <option value={20}>20 Results</option>
              <option value={50}>50 Results</option>
            </select>
          </label>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
              Catalyst Filters
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-[11px] font-semibold text-muted hover:text-primary"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const g of CATALYST_GROUPS) for (const k of g.keywords) next[k] = true;
                  setOn(next);
                }}
              >
                Select All
              </button>
              <button
                type="button"
                className="text-[11px] font-semibold text-muted hover:text-primary"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const g of CATALYST_GROUPS) for (const k of g.keywords) next[k] = false;
                  setOn(next);
                }}
              >
                Clear All
              </button>
            </div>
          </div>

          {CATALYST_GROUPS.map((g) => {
            const allOn = g.keywords.every((k) => on[k]);
            return (
              <div key={g.id} className="mb-4">
                <div className="mb-2 flex items-center justify-between border-b border-primary/15 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    {g.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSection(g.id, !allOn)}
                    className={cn(
                      "rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase",
                      allOn
                        ? "border-primary/40 bg-primary-soft text-primary"
                        : "border-border text-subtle",
                    )}
                  >
                    {allOn ? "All on" : "All off"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.keywords.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggle(k)}
                      className={cn(
                        "rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
                        on[k] ? CHIP[g.id] : "border-border text-subtle opacity-40",
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Button
          className="mt-2 w-full"
          disabled={scan.isPending || activeKeywords.length === 0}
          onClick={() => scan.mutate()}
        >
          <Zap className="size-4" />
          {scan.isPending ? "Scanning…" : "Scan Market"}
        </Button>
      </Card>

      {scan.isError && (
        <Card>
          <p className="text-sm text-danger">Scan failed. Try a narrower filter.</p>
        </Card>
      )}

      {scan.data && (
        <Card>
          <div className="mb-3 text-[13px] font-bold uppercase tracking-wider text-muted">
            Market Catalysts · {visible.length}
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-subtle">No matching headlines in this window.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border border-border p-4 transition-colors hover:border-primary/40"
                >
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[15px] font-semibold text-fg no-underline hover:text-primary"
                  >
                    {n.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                    <span>{n.publisher}</span>
                    <span>·</span>
                    <span>{timeAgo(n.publishedAt)}</span>
                    {n.tickers.slice(0, 4).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="rounded-sm border border-primary/30 bg-primary-soft px-1.5 py-0.5 font-semibold uppercase text-primary"
                        onClick={() =>
                          void navigate({
                            to: "/analysis",
                            search: { ticker: t, tab: "analyze" },
                          })
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
