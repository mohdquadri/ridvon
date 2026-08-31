import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingViewChart } from "@/components/tradingview-chart";
import { getHistory } from "@/lib/market/api";
import { analyzeTechnicalAi } from "@/lib/market/ai";
import { snapshotFromBars } from "@/lib/market/indicators";
import { formatPercent, formatPrice, formatVolume } from "@/lib/market/format";
import { cn } from "@/lib/utils";
import type { GrokTechnical, TechnicalSnapshot } from "@/lib/market/types";

const INTERVALS = [
  { value: "5", label: "5-Min" },
  { value: "15", label: "15-Min" },
  { value: "60", label: "1-Hour" },
  { value: "D", label: "Daily" },
  { value: "W", label: "Weekly" },
] as const;

const STYLES = [
  { value: "dayTrading", label: "Day Trading" },
  { value: "swingTrading", label: "Swing Trading" },
  { value: "position", label: "Position" },
] as const;

export function TechnicalAnalysis({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [active, setActive] = useState(initialTicker);
  const [interval, setInterval] = useState("D");
  const [style, setStyle] = useState("swingTrading");
  const navigate = useNavigate();
  const wantAi = useRef(Boolean(initialTicker));

  useEffect(() => {
    if (initialTicker) {
      setTicker(initialTicker);
      setActive(initialTicker);
      wantAi.current = true;
    }
  }, [initialTicker]);

  const hist = useQuery({
    queryKey: ["history", active, interval],
    queryFn: () => getHistory({ data: { symbol: active, interval } }),
    enabled: Boolean(active),
  });

  const snap = useMemo(() => {
    if (!hist.data || hist.data.bars.length < 26) return null;
    return snapshotFromBars(
      hist.data.bars,
      {
        price: hist.data.price,
        changePercent: hist.data.changePercent,
        volume: hist.data.volume,
        high52: hist.data.high52,
        low52: hist.data.low52,
      },
      { sessionVwap: interval === "5" || interval === "15" || interval === "60", interval },
    );
  }, [hist.data, interval]);

  const ai = useMutation({
    mutationFn: () => {
      if (!snap) throw new Error("Need price history first");
      return analyzeTechnicalAi({
        data: { symbol: active, style, timeframe: interval, snapshot: snap },
      });
    },
  });

  function run() {
    const t = ticker.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (!t) return;
    wantAi.current = true;
    setActive(t);
    void navigate({ to: "/analysis", search: { ticker: t, tab: "technical" }, replace: true });
    if (t === active && snap) {
      wantAi.current = false;
      ai.mutate();
    }
  }

  useEffect(() => {
    if (!wantAi.current || !snap || ai.isPending) return;
    wantAi.current = false;
    ai.mutate();
  }, [snap, active, ai]);

  const analysis: GrokTechnical | null =
    ai.data && ai.data.ok ? ai.data.analysis : null;

  const tfLabel = INTERVALS.find((i) => i.value === interval)?.label;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Technical Analysis</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          Multi-timeframe EMA, VWAP, RSI, MACD, key support/resistance, Fibonacci, and Grok setups.
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block min-w-40 flex-1">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Ticker
            </span>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="e.g. TSLA"
              className="uppercase"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Timeframe
            </span>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Style
            </span>
            <div className="flex overflow-hidden rounded-md border border-border">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  className={cn(
                    "px-3 py-2 text-xs font-semibold",
                    style === s.value
                      ? "bg-primary-soft text-primary"
                      : "bg-bg text-muted hover:text-fg",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={run} disabled={hist.isFetching && Boolean(active)}>
            <Zap className="size-4" /> Analyze
          </Button>
        </div>
      </Card>

      {!active && (
        <Card className="py-16 text-center text-sm text-muted">
          Enter a ticker to run technicals.
        </Card>
      )}

      {hist.isLoading && <Skeleton className="h-32 rounded-lg" />}
      {hist.isError && (
        <Card>
          <p className="text-sm text-danger">Unable to fetch bars for {active}.</p>
        </Card>
      )}

      {snap && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Price"
              value={formatPrice(snap.price)}
              hint={snap.emaStack === "Mixed" ? "Mixed EMAs" : `${snap.emaStack} stack`}
              tone={
                snap.trend === "Bullish" ? "gain" : snap.trend === "Bearish" ? "loss" : undefined
              }
            />
            <Stat
              label="Change"
              value={formatPercent(snap.changePercent)}
              tone={snap.changePercent >= 0 ? "gain" : "loss"}
            />
            <Stat
              label="RSI (14)"
              value={snap.rsi.toFixed(1)}
              hint={
                snap.rsiZone === "overbought"
                  ? "Overbought"
                  : snap.rsiZone === "oversold"
                    ? "Oversold"
                    : "Neutral"
              }
              tone={snap.rsi > 70 ? "loss" : snap.rsi < 30 ? "gain" : undefined}
            />
            <Stat
              label="MACD"
              value={snap.macdHistogram >= 0 ? "Bull" : "Bear"}
              hint={snap.macdHistogram.toFixed(3)}
              tone={snap.macdHistogram >= 0 ? "gain" : "loss"}
            />
            <Stat
              label="Stoch %K"
              value={snap.stochK != null ? snap.stochK.toFixed(1) : "—"}
              hint={
                snap.stochK != null && snap.stochK > 80
                  ? "Overbought"
                  : snap.stochK != null && snap.stochK < 20
                    ? "Oversold"
                    : snap.stochD != null
                      ? `D ${snap.stochD.toFixed(1)}`
                      : undefined
              }
              tone={
                snap.stochK != null && snap.stochK > 80
                  ? "loss"
                  : snap.stochK != null && snap.stochK < 20
                    ? "gain"
                    : undefined
              }
            />
            <Stat
              label="Trend"
              value={snap.trend}
              hint={snap.vwap != null ? `VWAP ${formatPrice(snap.vwap)}` : undefined}
              tone={
                snap.trend === "Bullish" ? "gain" : snap.trend === "Bearish" ? "loss" : undefined
              }
            />
          </div>

          <SignalRow snap={snap} />

          <Card>
            <CardTitle className="mb-3">
              Moving Averages — {active} · {tfLabel}
            </CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["EMA 9", snap.ema9],
                  ["EMA 21", snap.ema21],
                  ["EMA 50", snap.ema50],
                  ["EMA 200", snap.ema200],
                  ["SMA 20", snap.sma20],
                  ["VWAP", snap.vwap],
                  ["Support", snap.support],
                  ["Resistance", snap.resistance],
                ] as const
              ).map(([k, v]) => (
                <MetricBox
                  key={k}
                  label={k}
                  value={formatPrice(v)}
                  hint={vsPrice(snap.price, v)}
                  tone={v != null && snap.price >= v ? "gain" : v != null ? "loss" : undefined}
                />
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-3">Momentum & Volatility</CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricBox label="MACD Line" value={snap.macd.toFixed(3)} />
              <MetricBox
                label="MACD Signal"
                value={snap.macdSignal.toFixed(3)}
                tone={snap.macd >= snap.macdSignal ? "gain" : "loss"}
              />
              <MetricBox
                label="MACD Hist."
                value={snap.macdHistogram.toFixed(4)}
                tone={snap.macdHistogram >= 0 ? "gain" : "loss"}
              />
              <MetricBox
                label="Stoch %D"
                value={snap.stochD != null ? snap.stochD.toFixed(1) : "—"}
              />
              <MetricBox label="ATR (14)" value={snap.atr ? formatPrice(snap.atr) : "—"} />
              <MetricBox label="BB Upper" value={formatPrice(snap.bbUpper)} />
              <MetricBox
                label="BB Mid (SMA20)"
                value={formatPrice(snap.bbMiddle)}
                hint={
                  snap.bbWidth != null ? `Width ${(snap.bbWidth * 100).toFixed(1)}%` : undefined
                }
              />
              <MetricBox label="BB Lower" value={formatPrice(snap.bbLower)} />
              <MetricBox label="Volume" value={formatVolume(snap.volume)} />
              <MetricBox
                label="Avg Vol (20)"
                value={formatVolume(snap.avgVolume)}
                hint={volHint(snap.volume, snap.avgVolume)}
                tone={volTone(snap.volume, snap.avgVolume)}
              />
              <MetricBox
                label="52W High"
                value={formatPrice(snap.high52)}
                hint={
                  snap.high52
                    ? formatPercent(((snap.price - snap.high52) / snap.high52) * 100)
                    : undefined
                }
              />
              <MetricBox
                label="52W Low"
                value={formatPrice(snap.low52)}
                hint={
                  snap.low52
                    ? formatPercent(((snap.price - snap.low52) / snap.low52) * 100)
                    : undefined
                }
              />
            </div>
          </Card>

          <KeyLevelsCard snap={snap} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FibCard snap={snap} />
            <PivotCard snap={snap} />
          </div>

          {ai.isPending && (
            <Card>
              <p className="text-sm text-muted">Grok is mapping the setup…</p>
            </Card>
          )}
          {ai.data && !ai.data.ok && (
            <Card>
              <p className="text-sm text-muted">{ai.data.error}</p>
            </Card>
          )}
          {analysis && (
            <>
              <Section title="1. Trend Bias" body={analysis.trend} />
              <Section title="2. Volatility & Expansion" body={analysis.volatility} />
              <Section title="3. Key Levels & Fibonacci Zones" body={analysis.levels} />
              <Card>
                <CardTitle className="mb-3">4. Trade Scenarios</CardTitle>
                <div className="flex flex-col gap-2">
                  <Scenario tone="gain" title="Bullish" body={analysis.bullish} />
                  <Scenario tone="loss" title="Bearish" body={analysis.bearish} />
                  <Scenario tone="warn" title="Neutral" body={analysis.neutral} />
                </div>
              </Card>
              <Section title="5. Risk Assessment" body={analysis.risk} />
              <Card className="border-primary/25 bg-primary-soft/40">
                <CardTitle className="mb-2">6. Recommendation</CardTitle>
                <p className="font-mono text-sm font-semibold">
                  Entry: {analysis.entry} · Stop: {analysis.stop} · Target: {analysis.target}
                </p>
                <p className="mt-1 text-sm">
                  Bias <strong>{analysis.bias}</strong> · Confidence {analysis.confidence}
                </p>
                <p className="mt-2 text-sm text-muted">{analysis.note}</p>
              </Card>
            </>
          )}

          <Card className="overflow-hidden p-0">
            <div className="h-[520px] w-full bg-ink sm:h-[640px]">
              <TradingViewChart symbol={active} interval={interval} theme="dark" studies />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function vsPrice(price: number, level: number | null): string | undefined {
  if (level == null || level === 0) return undefined;
  const pct = ((price - level) / level) * 100;
  return `${pct >= 0 ? "Above" : "Below"} ${formatPercent(pct)}`;
}

function volHint(vol: number | null, avg: number | null): string | undefined {
  if (vol == null || avg == null || avg === 0) return undefined;
  return `${(vol / avg).toFixed(2)}× avg`;
}

function volTone(vol: number | null, avg: number | null): "gain" | "loss" | undefined {
  if (vol == null || avg == null || avg === 0) return undefined;
  const r = vol / avg;
  if (r >= 1.4) return "gain";
  if (r <= 0.6) return "loss";
  return undefined;
}

function nearestFib(snap: TechnicalSnapshot) {
  if (!snap.fib) return null;
  let best = snap.fib.levels[0]!;
  let dist = Infinity;
  for (const l of snap.fib.levels) {
    const d = Math.abs(l.price - snap.price);
    if (d < dist) {
      dist = d;
      best = l;
    }
  }
  return { ...best, distPct: snap.price ? (dist / snap.price) * 100 : 0 };
}

function SignalRow({ snap }: { snap: TechnicalSnapshot }) {
  const chips: { label: string; tone?: "gain" | "loss" | "warn" }[] = [];
  chips.push({
    label: `EMA stack ${snap.emaStack.toLowerCase()}`,
    tone: snap.emaStack === "Bullish" ? "gain" : snap.emaStack === "Bearish" ? "loss" : "warn",
  });
  if (snap.vwap != null) {
    chips.push({
      label: snap.price >= snap.vwap ? "Price above VWAP" : "Price below VWAP",
      tone: snap.price >= snap.vwap ? "gain" : "loss",
    });
  }
  chips.push({
    label: snap.macdHistogram >= 0 ? "MACD positive" : "MACD negative",
    tone: snap.macdHistogram >= 0 ? "gain" : "loss",
  });
  if (snap.rsiZone !== "neutral") {
    chips.push({
      label: `RSI ${snap.rsiZone}`,
      tone: snap.rsiZone === "oversold" ? "gain" : "loss",
    });
  }
  if (snap.bbWidth != null && snap.bbWidth < 0.06) {
    chips.push({ label: "BB squeeze", tone: "warn" });
  }
  if (snap.bbUpper != null && snap.price > snap.bbUpper) {
    chips.push({ label: "Above upper band", tone: "loss" });
  }
  if (snap.bbLower != null && snap.price < snap.bbLower) {
    chips.push({ label: "Below lower band", tone: "gain" });
  }
  const fib = nearestFib(snap);
  if (fib && fib.distPct < 1.2) {
    chips.push({ label: `Near Fib ${fib.label}`, tone: "warn" });
  }
  const levels = snap.keyLevels ?? [];
  const nearR = levels
    .filter((l) => l.kind === "resistance")
    .sort((a, b) => a.price - b.price)[0];
  const nearS = levels
    .filter((l) => l.kind === "support")
    .sort((a, b) => b.price - a.price)[0];
  if (nearR && snap.price) {
    const pct = ((nearR.price - snap.price) / snap.price) * 100;
    if (pct >= 0 && pct < 1.2) chips.push({ label: `At resistance ${formatPrice(nearR.price)}`, tone: "loss" });
  }
  if (nearS && snap.price) {
    const pct = ((snap.price - nearS.price) / snap.price) * 100;
    if (pct >= 0 && pct < 1.2) chips.push({ label: `At support ${formatPrice(nearS.price)}`, tone: "gain" });
  }
  if (snap.gap && !snap.gap.filled) {
    chips.push({
      label: `Unfilled gap ${snap.gap.kind} ${formatPrice(snap.gap.from)}`,
      tone: "warn",
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className={cn(
            "rounded-sm px-2 py-1 text-[11px] font-semibold",
            c.tone === "gain" && "bg-primary-soft text-gain",
            c.tone === "loss" && "bg-danger-soft text-loss",
            c.tone === "warn" && "bg-warning-soft text-warning",
            !c.tone && "bg-bg text-muted",
          )}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function KeyLevelsCard({ snap }: { snap: TechnicalSnapshot }) {
  const levels = snap.keyLevels ?? [];
  const nearS = levels.filter((l) => l.kind === "support").sort((a, b) => b.price - a.price)[0];
  const nearR = levels.filter((l) => l.kind === "resistance").sort((a, b) => a.price - b.price)[0];
  const rows: Array<{ kind: "level" | "now"; level?: (typeof levels)[number] }> = [];
  let inserted = false;
  for (const level of levels) {
    if (!inserted && level.price < snap.price) {
      rows.push({ kind: "now" });
      inserted = true;
    }
    rows.push({ kind: "level", level });
  }
  if (!inserted) rows.push({ kind: "now" });

  return (
    <Card>
      <CardTitle className="mb-1">Key Support & Resistance</CardTitle>
      <p className="mb-3 text-xs text-muted">
        {nearS || nearR
          ? `Nearest support ${formatPrice(nearS?.price)} · nearest resistance ${formatPrice(nearR?.price)}`
          : "Not enough structure to map levels."}
      </p>
      {(snap.pdh || snap.pdl || snap.pdc) && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-md bg-bg px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-subtle">PDH</div>
            <div className="font-mono text-sm font-bold tabular text-loss">{formatPrice(snap.pdh)}</div>
          </div>
          <div className="rounded-md bg-bg px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-subtle">PDC</div>
            <div className="font-mono text-sm font-bold tabular">{formatPrice(snap.pdc)}</div>
          </div>
          <div className="rounded-md bg-bg px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-subtle">PDL</div>
            <div className="font-mono text-sm font-bold tabular text-gain">{formatPrice(snap.pdl)}</div>
          </div>
        </div>
      )}
      {snap.gap && (
        <p className={cn("mb-3 text-xs font-semibold", snap.gap.filled ? "text-muted" : "text-warning")}>
          {snap.gap.filled ? "Filled" : "Unfilled"} gap {snap.gap.kind} {formatPrice(snap.gap.from)} →{" "}
          {formatPrice(snap.gap.to)}
        </p>
      )}
      {levels.length > 0 && (
        <div>
          {rows.map((row, i) => {
            if (row.kind === "now") {
              return (
                <div key="now" className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-primary/35" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary tabular">
                    Now {formatPrice(snap.price)}
                  </span>
                  <div className="h-px flex-1 bg-primary/35" />
                </div>
              );
            }
            const l = row.level!;
            const dist = snap.price ? ((l.price - snap.price) / snap.price) * 100 : 0;
            const close = Math.abs(dist) < 1.2;
            return (
              <div
                key={`${l.kind}-${l.price.toFixed(2)}-${i}`}
                className={cn(
                  "flex items-center justify-between gap-3 border-b border-border/70 py-2.5",
                  close && "bg-primary-soft/50",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1 text-[10px] font-bold",
                        l.kind === "resistance"
                          ? "bg-danger-soft text-loss"
                          : "bg-primary-soft text-gain",
                      )}
                    >
                      {l.kind === "resistance" ? "R" : "S"}
                    </span>
                    <span
                      className={cn(
                        "text-[14px] font-bold tabular",
                        l.kind === "resistance" ? "text-loss" : "text-gain",
                      )}
                    >
                      {formatPrice(l.price)}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide",
                        l.strength === "Strong"
                          ? "text-primary"
                          : l.strength === "Medium"
                            ? "text-muted"
                            : "text-subtle",
                      )}
                    >
                      {l.strength}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate pl-7 text-[11px] text-subtle">
                    {l.sources.slice(0, 4).join(" · ")}
                    {l.touches > 1 ? ` · ${l.touches} touches` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-[12px] font-semibold tabular text-muted">
                  {formatPercent(dist)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function FibCard({ snap }: { snap: TechnicalSnapshot }) {
  const fib = snap.fib;
  const near = nearestFib(snap);
  return (
    <Card>
      <CardTitle className="mb-1">Fibonacci Retracement</CardTitle>
      <p className="mb-3 text-xs text-muted">
        {fib
          ? `${fib.up ? "Uptrend" : "Downtrend"} swing ${formatPrice(fib.low)} → ${formatPrice(fib.high)}`
          : "Not enough bars for a swing."}
      </p>
      {fib && (
        <div>
          {fib.levels.map((l) => {
            const active = near?.label === l.label && near.distPct < 1.5;
            return (
              <div
                key={l.label}
                className={cn(
                  "flex items-center justify-between border-b border-border/70 py-2",
                  active && "bg-primary-soft/60",
                )}
              >
                <span className="text-[11px] font-medium text-muted">
                  {l.label}
                  {l.ratio === 0.618 ? " golden" : ""}
                  {l.ratio === 0
                    ? fib.up
                      ? " · high"
                      : " · low"
                    : l.ratio === 1
                      ? fib.up
                        ? " · low"
                        : " · high"
                      : ""}
                </span>
                <span
                  className={cn(
                    "text-[13px] font-bold tabular",
                    active && "text-primary",
                  )}
                >
                  {formatPrice(l.price)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PivotCard({ snap }: { snap: TechnicalSnapshot }) {
  const p = snap.pivots;
  const rows = p
    ? [
        ["R3", p.r3],
        ["R2", p.r2],
        ["R1", p.r1],
        ["Pivot", p.pp],
        ["S1", p.s1],
        ["S2", p.s2],
        ["S3", p.s3],
      ]
    : [];
  return (
    <Card>
      <CardTitle className="mb-1">Classic Pivots</CardTitle>
      <p className="mb-3 text-xs text-muted">Prior bar high / low / close.</p>
      {p ? (
        <div>
          {rows.map(([k, v]) => {
            const above = snap.price >= (v as number);
            const isPp = k === "Pivot";
            return (
              <div
                key={k as string}
                className={cn(
                  "flex items-center justify-between border-b border-border/70 py-2",
                  isPp && "bg-bg",
                )}
              >
                <span className="text-[11px] font-medium text-muted">{k as string}</span>
                <span
                  className={cn(
                    "text-[13px] font-bold tabular",
                    isPp && "text-fg",
                    !isPp && (k as string).startsWith("R") && "text-loss",
                    !isPp && (k as string).startsWith("S") && "text-gain",
                  )}
                >
                  {formatPrice(v as number)}
                  <span className="ml-2 text-[10px] font-semibold text-subtle">
                    {above ? "px above" : "px below"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">Need a prior bar.</p>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-bold tabular",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-subtle">{hint}</div>}
    </div>
  );
}

function MetricBox({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="rounded-md bg-bg p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-sm font-bold tabular",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-subtle">{hint}</div>}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardTitle className="mb-2">{title}</CardTitle>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
    </Card>
  );
}

function Scenario({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "gain" | "loss" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-md border-l-[3px] bg-bg px-4 py-3",
        tone === "gain" && "border-l-gain",
        tone === "loss" && "border-l-loss",
        tone === "warn" && "border-l-warning",
      )}
    >
      <div
        className={cn(
          "mb-1 text-xs font-bold uppercase tracking-wide",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "warn" && "text-warning",
        )}
      >
        {title}
      </div>
      <p className="text-sm text-muted">{body}</p>
    </div>
  );
}
