import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DecisionCard } from "@/components/analysis/decision-card";
import { MarketConditions } from "@/components/analysis/market-conditions";
import { getFundamentals, getHistory, getNews, getOwnership, getQuotes, getSessionPrint } from "@/lib/market/api";
import { analyzeTradeAi } from "@/lib/market/ai";
import { snapshotFromBars } from "@/lib/market/indicators";
import { displayHeadline, formatPercent, formatPrice, formatRatio, formatShares, formatVolume } from "@/lib/market/format";
import { MARKET_CONFIRM, tapeFromSnap } from "@/lib/market/trade";
import { cn } from "@/lib/utils";
import type { GrokTradeCall } from "@/lib/market/types";

export function TradeDesk({ initialTicker }: { initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [active, setActive] = useState(initialTicker);
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
    queryKey: ["history", active, "D"],
    queryFn: () => getHistory({ data: { symbol: active, interval: "D" } }),
    enabled: Boolean(active),
  });

  const news = useQuery({
    queryKey: ["news", active],
    queryFn: () => getNews({ data: { query: active, count: 8 } }),
    enabled: Boolean(active),
  });

  const own = useQuery({
    queryKey: ["ownership", active],
    queryFn: () => getOwnership({ data: { symbol: active } }),
    enabled: Boolean(active),
    staleTime: 30 * 60 * 1000,
  });

  const fund = useQuery({
    queryKey: ["fundamentals", active],
    queryFn: () => getFundamentals({ data: { symbol: active } }),
    enabled: Boolean(active),
    staleTime: 5 * 60 * 1000,
  });

  const market = useQuery({
    queryKey: ["quotes", "confirm"],
    queryFn: () =>
      getQuotes({
        data: {
          symbols: [
            ...MARKET_CONFIRM.map((m) => m.symbol),
            "XLK",
            "XLF",
            "XLE",
            "XLV",
            "GDX",
          ],
        },
      }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const session = useQuery({
    queryKey: ["session", active],
    queryFn: () => getSessionPrint({ data: { symbol: active } }),
    enabled: Boolean(active),
    staleTime: 30_000,
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
      { sessionVwap: false, interval: "D" },
    );
  }, [hist.data]);

  const tape = useMemo(() => {
    if (!snap || !active) return null;
    return tapeFromSnap(active, snap, {
      rvol: own.data?.relVolume ?? null,
      floatShares: own.data?.sharesFloat ?? null,
      shortFloatPct: own.data?.shortFloatPct ?? null,
    });
  }, [snap, active, own.data]);

  const ai = useMutation({
    mutationFn: () => {
      if (!snap || !tape) throw new Error("Need tape first");
      return analyzeTradeAi({
        data: {
          symbol: active,
          name: hist.data?.name ?? active,
          snapshot: snap,
          rvol: tape.rvol,
          floatShares: own.data?.sharesFloat ?? null,
          shortFloatPct: own.data?.shortFloatPct ?? null,
          setup: tape.setup,
          score: tape.score,
          market: (market.data ?? []).map(
            (q) => `${q.symbol} ${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}%`,
          ),
          headlines: (news.data ?? []).slice(0, 6).map((n) => displayHeadline(n.title)),
        },
      });
    },
  });

  function run() {
    const t = ticker.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (!t) return;
    wantAi.current = true;
    setActive(t);
    void navigate({ to: "/analysis", search: { ticker: t, tab: "trade" }, replace: true });
    if (t === active && snap) {
      wantAi.current = false;
      ai.mutate();
    }
  }

  useEffect(() => {
    if (!wantAi.current || !snap || !tape || !news.isFetched || own.isFetching || ai.isPending) return;
    wantAi.current = false;
    ai.mutate();
  }, [snap, tape, news.isFetched, news.data, own.isFetching, own.data, active, ai]);

  const call: GrokTradeCall | null = ai.data && ai.data.ok ? ai.data.analysis : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Is this stock worth trading RIGHT NOW?</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          Trader Mode — go / no-go with setup, confidence, entry, stop, and target.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Ticker
            </span>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
              placeholder="e.g. IREN"
              className="uppercase"
            />
          </label>
          <Button onClick={run} className="sm:w-auto" disabled={hist.isFetching && Boolean(active)}>
            <Zap className="size-4" /> Get the call
          </Button>
        </div>
      </Card>

      {!active && (
        <Card className="py-16 text-center text-sm text-muted">
          Enter a ticker. Grok will say if it is a trade today.
        </Card>
      )}

      {active && hist.isLoading && <Skeleton className="h-28 rounded-lg" />}
      {hist.isError && (
        <Card>
          <p className="text-sm text-danger">Could not load {active}.</p>
        </Card>
      )}

      {snap && tape && (
        <>
          <DecisionCard call={call} loading={ai.isPending} />
          {ai.data && !ai.data.ok ? (
            <p className="text-sm text-muted">{ai.data.error}</p>
          ) : null}

          <MarketConditions
            quotes={market.data ?? []}
            ticker={active}
            sector={fund.data?.sector}
            industry={fund.data?.industry}
          />

          <Card>
            <CardTitle className="mb-3">Trader Tape</CardTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <Stat k="RVOL" v={tape.rvol != null ? `${tape.rvol.toFixed(1)}x` : "—"} hot={tape.rvol != null && tape.rvol >= 1.8} />
              <Stat
                k="Premarket"
                v={
                  session.data?.preChangePercent != null
                    ? `${session.data.preChangePercent >= 0 ? "+" : ""}${session.data.preChangePercent.toFixed(2)}%`
                    : "—"
                }
                hot={session.data?.session === "pre"}
              />
              <Stat k="Float" v={formatShares(own.data?.sharesFloat ?? tape.floatShares)} />
              <Stat k="Short float" v={(own.data?.shortFloatPct ?? tape.shortFloatPct) != null ? `${(own.data?.shortFloatPct ?? tape.shortFloatPct)!.toFixed(2)}%` : "—"} />
              <Stat k="VWAP" v={snap.vwap != null ? formatPrice(snap.vwap) : "—"} />
              <Stat k="EMA 9 / 21" v={`${formatPrice(snap.ema9)} / ${formatPrice(snap.ema21)}`} />
              <Stat k="RSI" v={formatRatio(snap.rsi, 1)} hot={snap.rsiZone !== "neutral"} />
              <Stat k="MACD hist" v={formatRatio(snap.macdHistogram, 3)} hot={snap.macdHistogram > 0} />
              <Stat k="Support" v={formatPrice(snap.support)} />
              <Stat k="Resistance" v={formatPrice(snap.resistance)} />
              <Stat
                k="Catalyst"
                v={
                  fund.data?.nextEarningsDate
                    ? `Earn ${fund.data.nextEarningsDate}${fund.data.nextEarningsEst ? " est." : ""}`
                    : news.data?.[0]
                      ? displayHeadline(news.data[0].title).slice(0, 28)
                      : "—"
                }
              />
              <Stat k="Setup / Score" v={`${tape.setup} · ${tape.score}`} hot={tape.score >= 75} />
            </div>
            <p className="mt-3 text-xs text-subtle">
              Change {formatPercent(snap.changePercent)} · Volume {formatVolume(snap.volume)} vs avg{" "}
              {formatVolume(snap.avgVolume)} · Trend {snap.trend} · Stack {snap.emaStack}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ k, v, hot }: { k: string; v: string; hot?: boolean }) {
  return (
    <div className="rounded-md bg-bg px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{k}</div>
      <div className={cn("mt-0.5 font-mono text-[15px] font-bold tabular", hot && "text-primary")}>{v}</div>
    </div>
  );
}
