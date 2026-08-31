export const INDEX_TICKERS = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "DIA", label: "DOW" },
  { symbol: "QQQ", label: "NASDAQ" },
  { symbol: "IWM", label: "RUSSELL" },
  { symbol: "USO", label: "OIL" },
  { symbol: "GLD", label: "GOLD" },
] as const;

export const CRYPTO_TICKERS = [
  { symbol: "BTC-USD", label: "BTC" },
  { symbol: "ETH-USD", label: "ETH" },
] as const;

export const OVERVIEW = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq Tech" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Small Caps" },
  { symbol: "SLV", name: "Silver" },
  { symbol: "TLT", name: "20Y Treasury" },
  { symbol: "XLK", name: "Tech Sector" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "EEM", name: "Emerging Mkts" },
  { symbol: "HYG", name: "High Yield" },
  { symbol: "SMH", name: "Semiconductors" },
  { symbol: "XLV", name: "Healthcare" },
] as const;

export const MOVER_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "AMD", "AVGO", "ORCL",
  "NFLX", "CRM", "INTC", "MU", "AMAT", "QCOM", "PLTR", "UBER", "SHOP",
  "JPM", "BAC", "GS", "V", "MA",
  "XOM", "CVX", "JNJ", "UNH", "LLY", "ABBV",
  "HD", "COST", "WMT", "KO", "DIS",
  "BA", "GE", "CAT", "COIN", "SMCI", "ARM", "WDC", "DAL",
] as const;

export const DEFAULT_WATCHLIST = ["NVDA", "TSLA", "AMD", "AAPL", "MSFT"];

export const DISPLAY_NAMES: Record<string, string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq Tech",
  DIA: "Dow Jones",
  IWM: "Small Caps",
  SLV: "Silver",
  TLT: "20Y Treasury",
  XLK: "Tech Sector",
  XLF: "Financials",
  XLE: "Energy",
  EEM: "Emerging Mkts",
  HYG: "High Yield",
  SMH: "Semiconductors",
  XLV: "Healthcare",
  USO: "Oil",
  GLD: "Gold",
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  AMD: "AMD",
  GOOGL: "Alphabet",
  META: "Meta",
  AMZN: "Amazon",
};

export const COMPETITORS: Record<string, string[]> = {
  AAPL: ["MSFT", "GOOGL", "META", "AMZN"],
  MSFT: ["AAPL", "GOOGL", "ORCL", "AMZN"],
  GOOGL: ["MSFT", "META", "AMZN", "AAPL"],
  META: ["GOOGL", "AMZN", "SNAP", "AAPL"],
  TSLA: ["GM", "F", "RIVN", "LCID"],
  NVDA: ["AMD", "AVGO", "TSM", "INTC"],
  AMD: ["NVDA", "INTC", "AVGO", "MU"],
  AMZN: ["WMT", "COST", "MSFT", "GOOGL"],
  NFLX: ["DIS", "AMZN", "GOOGL", "CMCSA"],
  JPM: ["BAC", "WFC", "GS", "MS"],
};

export type CatalystCategory =
  | "earn"
  | "fda"
  | "deal"
  | "ma"
  | "macro"
  | "ai"
  | "viral";

export const CATALYST_GROUPS: {
  id: CatalystCategory;
  title: string;
  keywords: string[];
}[] = [
  {
    id: "earn",
    title: "Corporate Events",
    keywords: ["earnings", "guidance", "revenue", "profit"],
  },
  {
    id: "fda",
    title: "FDA & Healthcare",
    keywords: ["fda", "approval", "drug", "trial"],
  },
  {
    id: "deal",
    title: "Deals & Partnerships",
    keywords: ["partnership", "collaboration", "contract", "deal", "agreement"],
  },
  {
    id: "ma",
    title: "M&A Activity",
    keywords: ["merger", "acquisition", "takeover", "buyout"],
  },
  {
    id: "macro",
    title: "Macro Events",
    keywords: ["expansion", "product launch", "innovation", "fed", "inflation"],
  },
  {
    id: "ai",
    title: "AI & Tech",
    keywords: [
      "artificial intelligence",
      "machine learning",
      "nvidia",
      "data center",
      "cloud",
      "semiconductor",
    ],
  },
  {
    id: "viral",
    title: "Viral & Social",
    keywords: ["short squeeze", "reddit", "viral"],
  },
];

export function yahooSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s === "BTC") return "BTC-USD";
  if (s === "ETH") return "ETH-USD";
  return s;
}

export function displaySymbol(symbol: string): string {
  if (symbol === "BTC-USD") return "BTC";
  if (symbol === "ETH-USD") return "ETH";
  return symbol;
}

export const EXCHANGE_NAMES: Record<string, string> = {
  NMS: "NASDAQ NMS - GLOBAL MARKET",
  NGM: "NASDAQ NGM - GLOBAL MARKET",
  NCM: "NASDAQ CAPITAL MARKET",
  NAS: "NASDAQ",
  NYQ: "NEW YORK STOCK EXCHANGE, INC.",
  NYE: "NEW YORK STOCK EXCHANGE, INC.",
  ASE: "NYSE AMERICAN",
  PCX: "NYSE ARCA",
  BTS: "CBOE BZX U.S. EQUITIES EXCHANGE",
  CQS: "NYSE",
  OQB: "OTCQB MARKETPLACE",
  PNK: "OTC MARKETS",
};

export function formatExchange(
  exchangeName: string | null | undefined,
  fullExchangeName?: string | null,
): string | null {
  if (exchangeName && EXCHANGE_NAMES[exchangeName]) return EXCHANGE_NAMES[exchangeName];
  if (fullExchangeName) return fullExchangeName;
  if (exchangeName) return exchangeName;
  return null;
}

