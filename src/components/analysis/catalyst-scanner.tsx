import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { scanCatalysts } from "@/lib/market/api";
import { CATALYST_GROUPS, type CatalystCategory } from "@/lib/market/universe";
import { displayHeadline, displaySummary, formatCompact, formatPercent, isMarkupDump, timeAgo } from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { NewsItem, NewsSentiment, ScanResult } from "@/lib/market/types";

const URL_RE = /(https?:\/\/[^\s<>"'`]+)/g;

function LinkifiedText({ text }: { text: string }) {
  if (isMarkupDump(text)) return null;
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>;
        if (/news\.google\.com/i.test(part)) return null;
        let label = part;
        try {
          label = new URL(part).hostname.replace(/^www\./, "");
        } catch {
          /* keep raw url */
        }
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="break-all font-semibold text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary"
          >
            {label}
          </a>
        );
      })}
    </>
  );
}

const CHIP: Record<CatalystCategory, string> = {
  earn: "border-warning/40 bg-warning-soft text-warning",
  fda: "border-primary/40 bg-primary-soft text-primary",
  deal: "border-border bg-bg text-fg",
  ma: "border-border bg-bg text-fg",
  macro: "border-border bg-bg text-muted",
  ai: "border-primary/30 bg-primary-soft text-primary",
  viral: "border-danger/40 bg-danger-soft text-danger",
};

const CAT_LABEL: Record<CatalystCategory, string> = {
  earn: "EARN",
  fda: "FDA",
  deal: "DEAL",
  ma: "M&A",
  macro: "MACRO",
  ai: "AI",
  viral: "VIRAL",
};

type SortKey = "latest" | "mcap" | "positive" | "negative";
type SortState = Record<SortKey, boolean>;
type ToneFilter = "all" | "positive" | "negative";

const SENT_CHIP: Record<NewsSentiment, string> = {
  positive: "border-gain/40 bg-primary-soft text-gain",
  negative: "border-danger/40 bg-danger-soft text-danger",
  mixed: "border-warning/40 bg-warning-soft text-warning",
  neutral: "border-border bg-bg text-subtle",
};

const SENT_LABEL: Record<NewsSentiment, string> = {
  positive: "Positive",
  negative: "Negative",
  mixed: "Mixed",
  neutral: "Neutral",
};

function recencyBucket(publishedAt: number): number {
  const ageH = (Date.now() / 1000 - publishedAt) / 3600;
  if (ageH <= 1) return 0;
  if (ageH <= 6) return 1;
  if (ageH <= 24) return 2;
  if (ageH <= 72) return 3;
  return 4;
}

function compareNews(a: NewsItem, b: NewsItem, sorts: SortState): number {
  if (sorts.latest && sorts.mcap) {
    const bucket = recencyBucket(a.publishedAt) - recencyBucket(b.publishedAt);
    if (bucket) return bucket;
    const cap = (b.marketCap ?? -1) - (a.marketCap ?? -1);
    if (cap) return cap;
  } else if (sorts.latest) {
    const t = b.publishedAt - a.publishedAt;
    if (t) return t;
  } else if (sorts.mcap) {
    const cap = (b.marketCap ?? -1) - (a.marketCap ?? -1);
    if (cap) return cap;
  }
  if (sorts.positive) {
    const s = (b.sentimentScore ?? 0) - (a.sentimentScore ?? 0);
    if (s) return s;
  }
  if (sorts.negative) {
    const s = (a.sentimentScore ?? 0) - (b.sentimentScore ?? 0);
    if (s) return s;
  }
  return b.publishedAt - a.publishedAt;
}

export function CatalystScanner({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [windowDays, setWindowDays] = useState("1");
  const [max, setMax] = useState(50);
  const [sorts, setSorts] = useState<SortState>({
    latest: true,
    mcap: true,
    positive: false,
    negative: false,
  });
  const [tone, setTone] = useState<ToneFilter>("all");
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
          windowDays: Number(windowDays),
        },
      }),
  });

  function toggle(keyword: string) {
    setOn((prev) => ({ ...prev, [keyword]: !prev[keyword] }));
  }

  function toggleSort(key: SortKey) {
    setSorts((prev) => {
      const next: SortState = { ...prev, [key]: !prev[key] };
      if (key === "positive" && next.positive) next.negative = false;
      if (key === "negative" && next.negative) next.positive = false;
      if (!next.latest && !next.mcap && !next.positive && !next.negative) {
        next.latest = true;
      }
      return next;
    });
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

  const result: ScanResult | undefined = scan.data;
  const items: NewsItem[] = useMemo(() => {
    const raw = result?.items ?? [];
    const filtered =
      tone === "all"
        ? raw
        : raw.filter((n) => (n.sentiment ?? "neutral") === tone);
    return [...filtered].sort((a, b) => compareNews(a, b, sorts));
  }, [result?.items, sorts, tone]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Catalyst Scanner</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          Live headlines from Google News, Yahoo, Finviz, Nasdaq, MarketBeat, CNBC, and Benzinga —
          matched to your catalyst keywords.
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
              <option value={20}>20 Results</option>
              <option value={50}>50 Results</option>
              <option value={80}>80 Results</option>
            </select>
          </label>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
              Catalyst Filters · {activeKeywords.length} on
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
          {scan.isPending ? "Scanning sources…" : "Scan Market"}
        </Button>
      </Card>

      {scan.isError && (
        <Card>
          <p className="text-sm text-danger">Scan failed. Try a narrower filter or another window.</p>
        </Card>
      )}

      {result && (
        <Card>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-1 text-[13px] font-bold uppercase tracking-wider text-muted">
                Market Catalysts · {items.length}
                {result.matched > items.length ? ` of ${result.matched}` : ""}
              </div>
              <p className="text-[12px] text-subtle">
                Scanned {result.fetched} headlines
                {Object.keys(result.sources).length > 0
                  ? ` from ${Object.entries(result.sources)
                      .sort((a, b) => b[1] - a[1])
                      .map(([s, n]) => `${s} (${n})`)
                      .join(" · ")}`
                  : ""}
                . {result.matched} matched your keywords.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-subtle">
                  Sort
                </span>
                {(
                  [
                    ["latest", "Latest"],
                    ["mcap", "Market Cap"],
                    ["positive", "Positive"],
                    ["negative", "Negative"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleSort(k)}
                    className={cn(
                      "rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
                      sorts[k]
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted hover:border-primary/40",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {sorts.latest && sorts.mcap ? (
                <p className="text-[10px] text-subtle">
                  Combined: newest window first, then largest market cap.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-subtle">
                  Show
                </span>
                {(
                  [
                    ["all", "All"],
                    ["positive", "Positive"],
                    ["negative", "Negative"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTone(k)}
                    className={cn(
                      "rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
                      tone === k
                        ? k === "negative"
                          ? "border-danger/40 bg-danger-soft text-danger"
                          : "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted hover:border-primary/40",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-subtle">
              {result.items.length > 0 && tone !== "all"
                ? `No ${tone} headlines in this set. Switch sentiment to All.`
                : "No matching headlines in this window. Widen the time range or turn on more filters."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((n) => {
                const title = displayHeadline(n.title);
                const summary = displaySummary(n.summary, title);
                if (!title) return null;
                return (
                <li
                  key={n.id}
                  className="rounded-md border border-border p-4 transition-colors hover:border-primary/40"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {n.sentiment ? (
                      <span
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                          SENT_CHIP[n.sentiment],
                        )}
                      >
                        {SENT_LABEL[n.sentiment]}
                      </span>
                    ) : null}
                    {n.category ? (
                      <span
                        className={cn(
                          "rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                          CHIP[n.category],
                        )}
                      >
                        {CAT_LABEL[n.category]}
                      </span>
                    ) : null}
                    <span className="whitespace-nowrap rounded-sm border border-border bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                      {n.source ?? n.publisher}
                    </span>
                    {(n.matched ?? []).slice(0, 3).map((k) => (
                      <span
                        key={k}
                        className="whitespace-nowrap rounded-sm bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                      >
                        {k}
                      </span>
                    ))}
                    {(n.matched?.length ?? 0) > 3 ? (
                      <span className="text-[10px] font-semibold text-subtle">
                        +{(n.matched?.length ?? 0) - 3}
                      </span>
                    ) : null}
                  </div>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[15px] font-semibold text-primary underline decoration-primary/35 underline-offset-2 hover:decoration-primary"
                  >
                    {title}
                  </a>
                  {summary ? (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                      <LinkifiedText
                        text={summary.length > 220 ? summary.slice(0, 220) + "…" : summary}
                      />
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                    <span>{n.publisher}</span>
                    <span>·</span>
                    <span>{timeAgo(n.publishedAt)}</span>
                    {n.marketCap != null ? (
                      <>
                        <span>·</span>
                        <span className="font-semibold text-fg">{formatCompact(n.marketCap)}</span>
                      </>
                    ) : null}
                    {n.changePercent != null ? (
                      <span
                        className={cn(
                          "font-semibold",
                          n.changePercent >= 0 ? "text-gain" : "text-danger",
                        )}
                      >
                        {formatPercent(n.changePercent)}
                      </span>
                    ) : null}
                    {n.tickers.slice(0, 4).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="rounded-sm border border-primary/30 bg-primary-soft px-1.5 py-0.5 font-semibold uppercase text-primary"
                        onClick={() =>
                          void navigate({
                            to: "/analysis",
                            search: { ticker: t, tab: "trade" },
                          })
                        }
                      >
                        {t}
                      </button>
                    ))}
                    <a
                      href={n.link}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 font-semibold text-primary no-underline hover:underline"
                    >
                      Read
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
