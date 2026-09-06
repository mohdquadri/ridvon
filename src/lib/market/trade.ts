import type { TechnicalSnapshot, TradeSetup, TradeTape } from "./types";

export function rvolOf(snap: TechnicalSnapshot): number | null {
  if (snap.volume == null || snap.avgVolume == null || snap.avgVolume <= 0) return null;
  return snap.volume / snap.avgVolume;
}

export function classifySetup(snap: TechnicalSnapshot, rvol: number | null): TradeSetup {
  const r = rvol ?? 1;
  const nearHigh = snap.resistance > 0 && snap.price >= snap.resistance * 0.995;
  if (nearHigh && r >= 1.4 && snap.trend === "Bullish") return "Breakout";
  if (r >= 1.8 && snap.rsi >= 55 && snap.macdHistogram > 0) return "Momentum";
  if (snap.emaStack === "Bullish" && snap.trend === "Bullish") return "Trend";
  if (snap.rsiZone === "oversold" || (snap.macdHistogram > 0 && snap.trend !== "Bearish" && snap.rsi <= 40)) {
    return "Reversal";
  }
  return "Chop";
}

export function scoreTape(snap: TechnicalSnapshot, rvol: number | null, setup: TradeSetup): number {
  let s = 38;
  if (rvol != null) s += Math.min(24, Math.max(-6, (rvol - 1) * 12));
  if (snap.trend === "Bullish") s += 16;
  else if (snap.trend === "Bearish") s -= 14;
  if (snap.emaStack === "Bullish") s += 10;
  else if (snap.emaStack === "Bearish") s -= 8;
  if (snap.macdHistogram > 0) s += 8;
  if (setup === "Breakout") s += 12;
  else if (setup === "Momentum") s += 9;
  else if (setup === "Trend") s += 7;
  else if (setup === "Chop") s -= 6;
  if (snap.rsiZone === "overbought") s -= 7;
  if (snap.rsiZone === "oversold" && setup === "Reversal") s += 5;
  return Math.max(1, Math.min(99, Math.round(s)));
}

export function tapeFromSnap(
  symbol: string,
  snap: TechnicalSnapshot,
  extra?: { rvol?: number | null; floatShares?: number | null; shortFloatPct?: number | null },
): TradeTape {
  const rvol = extra?.rvol ?? rvolOf(snap);
  const setup = classifySetup(snap, rvol);
  return {
    symbol,
    price: snap.price,
    changePercent: snap.changePercent,
    rvol,
    floatShares: extra?.floatShares ?? null,
    shortFloatPct: extra?.shortFloatPct ?? null,
    setup,
    score: scoreTape(snap, rvol, setup),
    volume: snap.volume,
    avgVolume: snap.avgVolume,
    vwap: snap.vwap,
    rsi: snap.rsi,
  };
}

export function marketTone(changePercent: number): "up" | "flat" | "down" {
  if (changePercent > 0.25) return "up";
  if (changePercent < -0.25) return "down";
  return "flat";
}

export function sectorEtf(sector: string | null, industry: string | null): { symbol: string; label: string } {
  const s = `${sector ?? ""} ${industry ?? ""}`.toLowerCase();
  if (/semi|chip|gpu|foundry/.test(s)) return { symbol: "SMH", label: "Semis" };
  if (/crypto|bitcoin|mining|digital asset/.test(s)) return { symbol: "BTC-USD", label: "Crypto" };
  if (/software|internet|tech|quantum|cloud|computer/.test(s)) return { symbol: "XLK", label: "Tech" };
  if (/financ|bank|insur|capital/.test(s)) return { symbol: "XLF", label: "Financials" };
  if (/energy|oil|gas|uranium|solar/.test(s)) return { symbol: "XLE", label: "Energy" };
  if (/health|bio|pharma|drug/.test(s)) return { symbol: "XLV", label: "Healthcare" };
  if (/min|metal|gold|silver|material/.test(s)) return { symbol: "GDX", label: "Miners" };
  if (/crypto|bitcoin|mining/.test(s)) return { symbol: "IBIT", label: "Crypto" };
  return { symbol: "SPY", label: "Market" };
}

export const MARKET_CONFIRM = [
  { symbol: "SPY", label: "SPY" },
  { symbol: "QQQ", label: "QQQ" },
  { symbol: "IWM", label: "IWM" },
  { symbol: "SMH", label: "SMH" },
  { symbol: "BTC-USD", label: "BTC" },
] as const;
