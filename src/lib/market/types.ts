export type Quote = {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  high52?: number | null;
  low52?: number | null;
  sparkline: number[];
};

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type History = {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number | null;
  high52: number | null;
  low52: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  firstTradeDate: number | null;
  exchangeName: string | null;
  fullExchangeName: string | null;
  bars: Bar[];
};

export type NewsSentiment = "positive" | "negative" | "mixed" | "neutral";

export type NewsItem = {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;
  tickers: string[];
  summary?: string;
  source?: string;
  category?: "earn" | "fda" | "deal" | "ma" | "macro" | "ai" | "viral";
  matched?: string[];
  sentiment?: NewsSentiment;
  sentimentScore?: number;
  marketCap?: number | null;
  changePercent?: number | null;
};

export type ScanResult = {
  items: NewsItem[];
  fetched: number;
  matched: number;
  sources: Record<string, number>;
  windowDays: number;
};

export type Mover = Quote & { kind: "gainer" | "loser" };

export type KeyLevel = {
  price: number;
  kind: "support" | "resistance";
  score: number;
  touches: number;
  strength: "Strong" | "Medium" | "Weak";
  sources: string[];
};

export type TechnicalSnapshot = {
  price: number;
  changePercent: number;
  rsi: number;
  rsiZone: "overbought" | "oversold" | "neutral";
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  sma20: number | null;
  vwap: number | null;
  stochK: number | null;
  stochD: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbWidth: number | null;
  atr: number | null;
  support: number;
  resistance: number;
  keyLevels: KeyLevel[];
  pdh: number | null;
  pdl: number | null;
  pdc: number | null;
  gap: {
    kind: "up" | "down";
    from: number;
    to: number;
    filled: boolean;
  } | null;
  volume: number | null;
  avgVolume: number | null;
  high52: number | null;
  low52: number | null;
  trend: "Bullish" | "Bearish" | "Neutral";
  emaStack: "Bullish" | "Bearish" | "Mixed";
  fib: {
    high: number;
    low: number;
    up: boolean;
    levels: Array<{ ratio: number; label: string; price: number }>;
  } | null;
  pivots: {
    pp: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  } | null;
};

export type AnalysisTab = "analyze" | "technical" | "scanner";

export type HorizonCall = {
  action: string;
  take: string;
  entry: string;
  stop: string;
  target: string;
};

export type GrokFundamental = {
  valuation: { metric: string; take: string };
  growth: { metric: string; take: string };
  risks: { metric: string; take: string };
  sentiment: string;
  outlook: string;
  shortTerm: HorizonCall;
  swing: HorizonCall;
  longTerm: HorizonCall;
};

export type GrokTechnical = {
  trend: string;
  volatility: string;
  levels: string;
  bullish: string;
  bearish: string;
  neutral: string;
  risk: string;
  entry: string;
  stop: string;
  target: string;
  bias: string;
  confidence: string;
  note: string;
};

export type Fundamentals = {
  marketCap: number | null;
  enterpriseValue: number | null;
  revenueTtm: number | null;
  freeCashFlow: number | null;
  sharesOutstanding: number | null;
  sharesFloat: number | null;
  profitMargin: number | null;
  operatingMargin: number | null;
  grossMargin: number | null;
  evEbitda: number | null;
  epsTtm: number | null;
  peTtm: number | null;
  forwardPe: number | null;
  psTtm: number | null;
  roe: number | null;
  roa: number | null;
  currentRatio: number | null;
  industry: string | null;
  sector: string | null;
  exchange: string | null;
  nextEarningsDate: string | null;
  nextEarningsEst: boolean;
  lastEarningsDate: string | null;
  lastEpsActual: number | null;
  lastEpsEstimate: number | null;
  lastEpsSurprisePct: number | null;
  insiderOwnPct: number | null;
  insiderTransPct: number | null;
  instOwnPct: number | null;
  instTransPct: number | null;
  shortFloatPct: number | null;
  shortRatio: number | null;
  shortInterest: number | null;
  insiderTrades: InsiderTrade[];
  insiderBuyShares: number;
  insiderSellShares: number;
  insiderBuyValue: number;
  insiderSellValue: number;
};

export type InsiderTrade = {
  name: string;
  title: string;
  date: string;
  kind: "buy" | "sell" | "grant" | "other";
  shares: number;
  value: number | null;
  price: number | null;
};

export type PeerStat = {
  symbol: string;
  price: number;
  changePercent: number;
  peTtm: number | null;
  forwardPe: number | null;
  psTtm: number | null;
  profitMargin: number | null;
};
