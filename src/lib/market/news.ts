import { CATALYST_GROUPS, DISPLAY_NAMES, MOVER_UNIVERSE, type CatalystCategory } from "./universe";
import type { NewsItem, ScanResult } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type RawItem = {
  title: string;
  link: string;
  publisher: string;
  publishedAt: number;
  summary: string;
  source: string;
  tickers: string[];
};

const ITEM_RE = /<item\b[\s\S]*?<\/item>/gi;
const TAG_RE = /<[^>]+>/g;
const AMP = "\u0026";

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(new RegExp(AMP + "#x201[89];", "gi"), "'")
      .replace(new RegExp(AMP + "#x201[34];", "gi"), "-")
      .replace(new RegExp(AMP + "#(\\d+);", "g"), (_, n) => {
        const c = Number(n);
        return Number.isFinite(c) ? String.fromCharCode(c) : _;
      })
      .replace(new RegExp(AMP + "#x([0-9a-f]+);", "gi"), (_, n) => {
        const c = Number.parseInt(n, 16);
        return Number.isFinite(c) ? String.fromCharCode(c) : _;
      })
      .replace(new RegExp(AMP + "(amp|lt|gt|quot|apos|nbsp);", "gi"), (_, k: string) => {
        return named[k.toLowerCase()] ?? `${AMP}${k};`;
      });
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

function stripTags(s: string): string {
  return decodeEntities(s).replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
}

function firstHref(raw: string): string | null {
  const decoded = decodeEntities(raw);
  const m = /href\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(decoded);
  return m?.[1] ?? null;
}

function looksLikeMarkup(s: string): boolean {
  return /href\s*=|<\s*\/?\s*a\b|target\s*=|_blank|<\s*font\b|<\s*\/?\s*a/i.test(s);
}

function cleanSummary(raw: string, title: string, source?: string): string {
  if (source === "Google News") return "";
  if (looksLikeMarkup(raw) || looksLikeMarkup(decodeEntities(raw))) return "";
  let s = stripTags(raw);
  s = s.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  if (looksLikeMarkup(s) || s.length < 28) return "";
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nt = norm(title);
  const ns = norm(s);
  if (!ns || ns === nt || ns.startsWith(nt) || nt.startsWith(ns)) return "";
  return s.slice(0, 280);
}

function tagValue(block: string, name: string): string {
  const re = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>|<${name}(?:\\s[^>]*)?/>`,
    "i",
  );
  const m = re.exec(block);
  return m?.[1] ? stripTags(m[1]) : "";
}

function attrValue(block: string, name: string, attr: string): string {
  const re = new RegExp(`<${name}[^>]*\\s${attr}="([^"]+)"[^>]*>`, "i");
  return re.exec(block)?.[1] ?? "";
}

async function fetchText(url: string, timeoutMs = 8_000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml, text/xml, text/html, application/json, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parsePubDate(raw: string): number {
  if (!raw) return Math.floor(Date.now() / 1000);
  const t = Date.parse(raw);
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return Math.floor(Date.now() / 1000);
}

function parseRss(xml: string, source: string, fallbackPublisher: string): RawItem[] {
  const out: RawItem[] = [];
  const blocks = xml.match(ITEM_RE) ?? [];
  for (const block of blocks) {
    const titleRaw = tagValue(block, "title");
    const descRaw = (() => {
      const re = /<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i;
      return re.exec(block)?.[1] ?? "";
    })();
    const link =
      firstHref(descRaw) ||
      tagValue(block, "link") ||
      attrValue(block, "link", "href") ||
      tagValue(block, "guid");
    if (!titleRaw || !link || !link.startsWith("http")) continue;
    let title = titleRaw;
    let publisher =
      tagValue(block, "source") ||
      tagValue(block, "dc:creator") ||
      tagValue(block, "author") ||
      fallbackPublisher;
    if (source === "Google News") {
      const split = title.match(/^(.*)\s[-–—]\s+(.{2,40})$/);
      if (split) {
        title = split[1]!.trim();
        if (!tagValue(block, "source")) publisher = split[2]!.trim();
      }
    }
    const summary = cleanSummary(descRaw, title, source);
    out.push({
      title,
      link,
      publisher: publisher || fallbackPublisher,
      publishedAt: parsePubDate(tagValue(block, "pubDate") || tagValue(block, "dc:date")),
      summary,
      source,
      tickers: extractTickers(`${title} ${summary}`),
    });
  }
  return out;
}

const TICKER_RE =
  /(?:\$|NYSE:\s*|NASDAQ:\s*|Nasdaq:\s*|NYSEAMERICAN:\s*)([A-Z]{1,5})\b|\(([A-Z]{1,5})\)/g;

const STOP = new Set([
  "A", "I", "AM", "PM", "US", "CEO", "CFO", "IPO", "AI", "ETF", "GDP", "CPI", "PCE",
  "FDA", "SEC", "FED", "FOMC", "USD", "EPS", "YOY", "QOQ", "TTM", "EV", "PE", "THE",
  "AND", "FOR", "NEW", "BIG", "ALL", "NOW", "DAY",
]);

function extractTickers(text: string): string[] {
  const found = new Set<string>();
  TICKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TICKER_RE.exec(text))) {
    const t = (m[1] || m[2] || "").toUpperCase();
    if (t.length >= 1 && t.length <= 5 && !STOP.has(t)) found.add(t);
  }
  const hay = ` ${text.toLowerCase()} `;
  for (const [name, sym] of COMPANY_NAMES) {
    if (hay.includes(` ${name} `) || hay.includes(` ${name}'s `) || hay.includes(` ${name},`)) {
      found.add(sym);
    }
  }
  const upper = ` ${text.toUpperCase().replace(/[^A-Z0-9]+/g, " ")} `;
  for (const sym of KNOWN_SYM) {
    if (upper.includes(` ${sym} `)) found.add(sym);
  }
  return [...found];
}

const COMPANY_NAMES: Array<[string, string]> = (
  [
    ["nvidia", "NVDA"],
    ["microsoft", "MSFT"],
    ["alphabet", "GOOGL"],
    ["google", "GOOGL"],
    ["amazon", "AMZN"],
    ["apple", "AAPL"],
    ["tesla", "TSLA"],
    ["meta", "META"],
    ["netflix", "NFLX"],
    ["broadcom", "AVGO"],
    ["advanced micro", "AMD"],
    ["taiwan semi", "TSM"],
    ["tsmc", "TSM"],
    ["oracle", "ORCL"],
    ["salesforce", "CRM"],
    ["intel", "INTC"],
    ["micron", "MU"],
    ["applied materials", "AMAT"],
    ["qualcomm", "QCOM"],
    ["palantir", "PLTR"],
    ["uber", "UBER"],
    ["shopify", "SHOP"],
    ["jpmorgan", "JPM"],
    ["jp morgan", "JPM"],
    ["goldman sachs", "GS"],
    ["bank of america", "BAC"],
    ["exxon", "XOM"],
    ["chevron", "CVX"],
    ["johnson & johnson", "JNJ"],
    ["unitedhealth", "UNH"],
    ["eli lilly", "LLY"],
    ["lilly", "LLY"],
    ["abbvie", "ABBV"],
    ["home depot", "HD"],
    ["costco", "COST"],
    ["walmart", "WMT"],
    ["coca-cola", "KO"],
    ["disney", "DIS"],
    ["boeing", "BA"],
    ["schlumberger", "SLB"],
    ["lam research", "LRCX"],
    ["ouster", "OUST"],
    ["coinbase", "COIN"],
    ["super micro", "SMCI"],
    ["thomson reuters", "TRI"],
    ["thinkific", "THNC"],
  ] as Array<[string, string]>
)
  .concat(Object.entries(DISPLAY_NAMES).map(([sym, name]) => [name.toLowerCase(), sym]))
  .sort((a, b) => b[0].length - a[0].length);

const KNOWN_SYM = new Set<string>([
  ...COMPANY_NAMES.map(([, s]) => s),
  ...MOVER_UNIVERSE,
]);

type ToneHit = { re: RegExp; w: number };

const POS_TONE: ToneHit[] = [
  { re: /\bbeats? (estimates|expectations|forecasts|wall street)\b/i, w: 3 },
  { re: /\b(soars?|surges?|skyrockets?|rockets?|rall(?:y|ies|ied))\b/i, w: 3 },
  { re: /\b(all[- ]time high|record high|hits? a record|best month)\b/i, w: 3 },
  { re: /\b(upgrade[ds]?|raised? (guidance|outlook|forecast)|guides higher)\b/i, w: 3 },
  { re: /\b(approves?|approved|approval|fda (nod|clearance)|clears fda)\b/i, w: 3 },
  { re: /\b(buyout|acquired|to acquire|takeover)\b/i, w: 2 },
  { re: /\b(jumps?|jumped|climbs?|climbed|rises?|rose|gains? \d)\b/i, w: 2 },
  { re: /\b(outperforms?|blockbuster|breakout|bullish|optimistic)\b/i, w: 2 },
  { re: /\b(partnership|wins contract|awarded|expansion)\b/i, w: 1 },
  { re: /\b(profit|growth|boom|strong (quarter|demand|sales))\b/i, w: 1 },
  { re: /\b(buy rating|overweight|outperform rating)\b/i, w: 2 },
];

const NEG_TONE: ToneHit[] = [
  { re: /\bmiss(?:es|ed)? (estimates|expectations|forecasts|wall street)\b/i, w: 3 },
  { re: /\b(plunges?|tumbles?|crashes?|collapses?|plummets?)\b/i, w: 3 },
  { re: /\b(downgrade[ds]?|cut[s ]+(guidance|outlook|forecast)|guides lower)\b/i, w: 3 },
  { re: /\b(lawsuit|sues?|probe|investigation|fraud|recall)\b/i, w: 3 },
  { re: /\b(bankrupt(?:cy)?|layoffs?|profit warning)\b/i, w: 3 },
  { re: /\b(slumps?|slides?|sinks?|drops?|falls?|fell|sell[- ]off)\b/i, w: 2 },
  { re: /\b(delay(?:ed|s)?|rejected|halts?|halted|warning)\b/i, w: 2 },
  { re: /\b(bearish|underperform|sell rating|underweight|weak (quarter|demand|sales))\b/i, w: 2 },
  { re: /\b(short seller|misses|disappoints?|worries|odds waver)\b/i, w: 1 },
];

function scoreSentiment(title: string, summary: string): { sentiment: NewsItem["sentiment"]; score: number } {
  const text = `${title} ${summary}`;
  let pos = 0;
  let neg = 0;
  for (const { re, w } of POS_TONE) if (re.test(text)) pos += w;
  for (const { re, w } of NEG_TONE) if (re.test(text)) neg += w;
  const score = pos - neg;
  if (pos > 0 && neg > 0 && Math.abs(score) < 2) return { sentiment: "mixed", score };
  if (score >= 1) return { sentiment: "positive", score };
  if (score <= -1) return { sentiment: "negative", score };
  return { sentiment: "neutral", score };
}

const capCache = new Map<string, { exp: number; cap: number | null }>();
const chgCache = new Map<string, { exp: number; chg: number | null }>();

async function marketCapOf(symbol: string): Promise<number | null> {
  const hit = capCache.get(symbol);
  if (hit && hit.exp > Date.now()) return hit.cap;
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 86400 * 400;
  const url =
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?type=trailingMarketCap&period1=${period1}&period2=${period2}`;
  const text = await fetchText(url, 6_000);
  let cap: number | null = null;
  if (text) {
    try {
      const json = JSON.parse(text) as {
        timeseries?: { result?: Array<{ trailingMarketCap?: Array<{ reportedValue?: { raw?: number } }> }> };
      };
      const arr = json.timeseries?.result?.[0]?.trailingMarketCap;
      if (Array.isArray(arr)) {
        for (let i = arr.length - 1; i >= 0; i--) {
          const raw = arr[i]?.reportedValue?.raw;
          if (typeof raw === "number" && raw > 0) {
            cap = raw;
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  capCache.set(symbol, { exp: Date.now() + 6 * 3600_000, cap });
  return cap;
}

async function loadChanges(symbols: string[]): Promise<void> {
  const missing = symbols.filter((s) => {
    const hit = chgCache.get(s);
    return !hit || hit.exp < Date.now();
  });
  for (let i = 0; i < missing.length; i += 12) {
    const chunk = missing.slice(i, i + 12);
    const url =
      "https://query1.finance.yahoo.com/v8/finance/spark?symbols=" +
      encodeURIComponent(chunk.join(",")) +
      "&range=1d&interval=5m";
    const text = await fetchText(url, 7_000);
    if (!text) continue;
    try {
      const json = JSON.parse(text) as Record<
        string,
        { previousClose?: number; chartPreviousClose?: number; close?: Array<number | null> }
      >;
      const now = Date.now() + 60_000;
      for (const s of chunk) {
        const row = json[s];
        const prev = row?.previousClose ?? row?.chartPreviousClose ?? null;
        const closes = row?.close ?? [];
        let price: number | null = null;
        for (let j = closes.length - 1; j >= 0; j--) {
          const v = closes[j];
          if (typeof v === "number") {
            price = v;
            break;
          }
        }
        const chg = price != null && prev && prev !== 0 ? ((price - prev) / prev) * 100 : null;
        chgCache.set(s, { exp: now, chg });
      }
    } catch {
      /* ignore */
    }
  }
}

async function enrichItems(items: NewsItem[]): Promise<NewsItem[]> {
  const symbols = [...new Set(items.flatMap((n) => n.tickers))].slice(0, 24);
  if (symbols.length === 0) return items;
  await loadChanges(symbols);
  const caps = await Promise.all(symbols.map((s) => marketCapOf(s)));
  const capMap = new Map(symbols.map((s, i) => [s, caps[i] ?? null]));
  return items.map((n) => {
    let bestCap: number | null = null;
    let bestChg: number | null = null;
    for (const t of n.tickers) {
      const cap = capMap.get(t) ?? null;
      if (cap != null && (bestCap == null || cap > bestCap)) {
        bestCap = cap;
        bestChg = chgCache.get(t)?.chg ?? null;
      }
    }
    if (bestCap == null && n.tickers[0]) bestChg = chgCache.get(n.tickers[0])?.chg ?? null;
    return { ...n, marketCap: bestCap, changePercent: bestChg };
  });
}

function googleWhen(days: number): string {
  if (days <= 0.05) return "when:1h";
  if (days <= 0.3) return "when:6h";
  if (days <= 1.2) return "when:1d";
  if (days <= 3.5) return "when:3d";
  if (days <= 8) return "when:7d";
  if (days <= 16) return "when:14d";
  return "when:1m";
}

async function googleNews(query: string): Promise<RawItem[]> {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=en-US&gl=US&ceid=US:en";
  const xml = await fetchText(url, 9_000);
  if (!xml) return [];
  return parseRss(xml, "Google News", "Google News");
}

async function yahooRss(symbol?: string): Promise<RawItem[]> {
  const url = symbol
    ? `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
    : "https://finance.yahoo.com/news/rssindex";
  const xml = await fetchText(url);
  if (!xml) return [];
  const items = parseRss(xml, "Yahoo", "Yahoo Finance");
  return items;
}

async function yahooSearchNews(query: string, count = 20): Promise<RawItem[]> {
  const url =
    "https://query1.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(query) +
    `&quotesCount=0&newsCount=${count}&enableFuzzyQuery=true`;
  const text = await fetchText(url, 8_000);
  if (!text) return [];
  try {
    const json = JSON.parse(text) as {
      news?: Array<{
        uuid?: string;
        title?: string;
        publisher?: string;
        link?: string;
        providerPublishTime?: number;
        relatedTickers?: string[];
      }>;
    };
    return (json.news ?? [])
      .filter((n) => n.title && n.link)
      .map((n) => ({
        title: n.title ?? "",
        link: n.link ?? "",
        publisher: n.publisher ?? "Yahoo Finance",
        publishedAt: n.providerPublishTime ?? Math.floor(Date.now() / 1000),
        summary: "",
        source: "Yahoo",
        tickers: n.relatedTickers ?? extractTickers(n.title ?? ""),
      }));
  } catch {
    return [];
  }
}

function parseFinvizClock(raw: string): number {
  const s = raw.replace(/\s+/g, " ").trim();
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const dated = s.match(/([A-Z][a-z]{2})-(\d{1,2})-(\d{2})(?:\s+(\d{1,2}):(\d{2})(AM|PM))?/i);
  if (dated) {
    const mon = months[dated[1]!];
    const day = dated[2]!.padStart(2, "0");
    const year = `20${dated[3]}`;
    let hh = 12;
    let mm = "00";
    if (dated[4]) {
      let h = Number(dated[4]);
      const ap = (dated[6] ?? "AM").toUpperCase();
      if (ap === "PM" && h < 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      hh = h;
      mm = dated[5]!.padStart(2, "0");
    }
    if (mon) {
      const t = Date.parse(`${year}-${mon}-${day}T${String(hh).padStart(2, "0")}:${mm}:00-04:00`);
      if (Number.isFinite(t)) return Math.floor(t / 1000);
    }
  }
  const clock = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (clock) {
    let h = Number(clock[1]);
    const ap = clock[3]!.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    const ny = new Date().toLocaleString("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const iso = ny.replace(/(\d{4})-(\d{2})-(\d{2}).*/, "$1-$2-$3");
    const t = Date.parse(`${iso}T${String(h).padStart(2, "0")}:${clock[2]}:00-04:00`);
    if (Number.isFinite(t)) return Math.floor(t / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

async function finvizMarket(): Promise<RawItem[]> {
  const html = await fetchText("https://finviz.com/news.ashx", 9_000);
  if (!html) return [];
  const out: RawItem[] = [];
  const rowRe =
    /news_date-cell[^>]*>([^<]+)<\/td>[\s\S]*?news_link-cell[^>]*data-boxover-text="([^"]+)"[\s\S]*?href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const title = decodeEntities(m[2] ?? "").trim();
    const link = m[3] ?? "";
    if (!title || !link.startsWith("http")) continue;
    out.push({
      title,
      link,
      publisher: publisherFromUrl(link),
      publishedAt: parseFinvizClock(m[1] ?? ""),
      summary: "",
      source: "Finviz",
      tickers: extractTickers(title),
    });
  }
  return out;
}

async function finvizQuote(symbol: string): Promise<RawItem[]> {
  const html = await fetchText(`https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`, 9_000);
  if (!html) return [];
  const out: RawItem[] = [];
  const rowRe =
    /<td[^>]*>\s*([^<]{3,24})\s*<\/td>[\s\S]{0,400}?class="tab-link-news" href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]{0,240}?<span>\(([^)]+)\)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const title = decodeEntities(m[3] ?? "").trim();
    const link = m[2] ?? "";
    if (!title || !link.startsWith("http")) continue;
    out.push({
      title,
      link,
      publisher: decodeEntities(m[4] ?? "Finviz"),
      publishedAt: parseFinvizClock(m[1] ?? ""),
      summary: "",
      source: "Finviz",
      tickers: extractTickers(title),
    });
  }
  return out;
}

function publisherFromUrl(link: string): string {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    const map: Record<string, string> = {
      "reuters.com": "Reuters",
      "bloomberg.com": "Bloomberg",
      "cnbc.com": "CNBC",
      "wsj.com": "WSJ",
      "marketwatch.com": "MarketWatch",
      "finance.yahoo.com": "Yahoo Finance",
      "yahoo.com": "Yahoo Finance",
      "seekingalpha.com": "Seeking Alpha",
      "benzinga.com": "Benzinga",
      "barrons.com": "Barron's",
      "ft.com": "Financial Times",
      "forbes.com": "Forbes",
      "investing.com": "Investing.com",
      "fool.com": "Motley Fool",
      "thestreet.com": "TheStreet",
      "nasdaq.com": "Nasdaq",
      "marketbeat.com": "MarketBeat",
      "foxbusiness.com": "Fox Business",
    };
    for (const [k, v] of Object.entries(map)) if (host.endsWith(k)) return v;
    return host.split(".")[0] ?? "Web";
  } catch {
    return "Web";
  }
}

async function nasdaqRss(symbol?: string): Promise<RawItem[]> {
  const url = symbol
    ? `https://www.nasdaq.com/feed/rssoutbound?symbol=${encodeURIComponent(symbol)}`
    : "https://www.nasdaq.com/feed/rssoutbound?category=Stocks";
  const xml = await fetchText(url);
  if (!xml) return [];
  const items = parseRss(xml, "Nasdaq", "Nasdaq");
  return items;
}

async function seekingAlpha(symbol: string): Promise<RawItem[]> {
  const xml = await fetchText(`https://seekingalpha.com/api/sa/combined/${encodeURIComponent(symbol)}.xml`);
  if (!xml) return [];
  const items = parseRss(xml, "Seeking Alpha", "Seeking Alpha");
  return items;
}

async function marketBeatMarket(): Promise<RawItem[]> {
  const html = await fetchText("https://www.marketbeat.com/articles/", 9_000);
  if (!html) return [];
  const out: RawItem[] = [];
  const seen = new Set<string>();
  const re =
    /<a[^>]+href="(https:\/\/www\.marketbeat\.com\/articles\/(?!topics\/)[^"]+)"[^>]*>([^<]{16,180})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const link = m[1] ?? "";
    const title = decodeEntities(m[2] ?? "").trim();
    if (!title || seen.has(link)) continue;
    seen.add(link);
    out.push({
      title,
      link,
      publisher: "MarketBeat",
      publishedAt: Math.floor(Date.now() / 1000) - out.length * 1800,
      summary: "",
      source: "MarketBeat",
      tickers: extractTickers(title),
    });
  }
  return out;
}

async function marketBeatTicker(symbol: string): Promise<RawItem[]> {
  const pages = await Promise.all([
    fetchText(`https://www.marketbeat.com/stocks/NASDAQ/${symbol}/news/`, 8_000),
    fetchText(`https://www.marketbeat.com/stocks/NYSE/${symbol}/news/`, 8_000),
  ]);
  const html = pages.find((p) => p && p.length > 2000) ?? null;
  if (!html) return [];
  const out: RawItem[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{20,180})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const link = m[1] ?? "";
    const title = decodeEntities(m[2] ?? "").trim();
    if (!title || seen.has(link)) continue;
    const host = (() => {
      try {
        return new URL(link).hostname;
      } catch {
        return "";
      }
    })();
    const useful =
      host.includes("marketbeat.com") && link.includes("/articles/") && !link.includes("/topics/")
        ? true
        : /yahoo|cnbc|reuters|marketwatch|barron|seekingalpha|benzinga|fool|thestreet|investing/.test(
            host,
          );
    if (!useful) continue;
    if (/Analyst Ratings|Insider Trades|Stock Ideas|Semiconductors|Mergers/.test(title)) continue;
    seen.add(link);
    out.push({
      title,
      link,
      publisher: publisherFromUrl(link),
      publishedAt: Math.floor(Date.now() / 1000) - out.length * 900,
      summary: "",
      source: "MarketBeat",
      tickers: extractTickers(title),
    });
  }
  return out;
}

async function genericRss(url: string, source: string, publisher: string): Promise<RawItem[]> {
  const xml = await fetchText(url);
  if (!xml) return [];
  return parseRss(xml, source, publisher);
}

const KEYWORD_ALIASES: Record<string, string[]> = {
  earnings: [
    "earnings",
    "eps",
    "beats estimates",
    "misses estimates",
    "quarterly results",
    "q1 results",
    "q2 results",
    "q3 results",
    "q4 results",
    "earnings call",
    "earnings beat",
    "earnings miss",
    "top-and-bottom",
  ],
  guidance: [
    "guidance",
    "outlook",
    "raises forecast",
    "cuts forecast",
    "guides higher",
    "guides lower",
    "raised outlook",
    "cut outlook",
    "full-year view",
  ],
  revenue: ["revenue", "sales beat", "top-line", "net sales", "top line"],
  profit: ["profit", "net income", "bottom line", "earnings beat"],
  fda: ["fda", "food and drug", "pdufa"],
  approval: ["approval", "approved", "fda clearance", "green light", "clears fda", "fda nod"],
  drug: ["drug", "therapy", "biologic", "candidate", "treatment"],
  trial: ["trial", "phase 1", "phase 2", "phase 3", "phase i", "phase ii", "phase iii", "clinical"],
  partnership: ["partnership", "partners with", "partnered", "strategic partner", "ties up with"],
  collaboration: ["collaboration", "collaborate", "collaborates", "joint venture"],
  contract: ["contract", "awarded", "wins deal", "government contract", "procurement"],
  deal: ["deal", "signs deal", "struck a deal", "inked"],
  agreement: ["agreement", "memorandum of understanding", "mou signed"],
  merger: ["merger", "merge with", "all-stock merger", "merging"],
  acquisition: ["acquisition", "acquire", "acquires", "acquired", "to buy", "to acquire", "takeover bid"],
  takeover: ["takeover", "hostile bid"],
  buyout: ["buyout", "go-private", "taken private", "lbo"],
  expansion: ["expansion", "expands", "expanding", "capacity increase"],
  "product launch": [
    "product launch",
    "launches",
    "unveils",
    "debuts",
    "introduces",
    "rolls out",
    "new product",
    "goes on sale",
  ],
  innovation: ["innovation", "breakthrough", "pioneering"],
  fed: ["fed", "federal reserve", "fomc", "powell", "rate cut", "rate hike", "interest rate"],
  inflation: ["inflation", "cpi", "pce", "consumer prices"],
  "artificial intelligence": [
    "artificial intelligence",
    "generative ai",
    "genai",
    "chatgpt",
    "openai",
    " ai ",
    "ai strategy",
    "ai chip",
  ],
  "ai partnership": ["ai partnership", "ai partner", "openai partnership", "anthropic partnership"],
  "ai integration": ["ai integration", "adds ai", "ai-powered", "ai powered", "integrates ai"],
  "nvidia partnership": ["nvidia partnership", "nvidia invest", "nvidia deal", "nvda partnership"],
  "data center expansion": ["data center expansion", "data center", "datacenter", "gpu cluster"],
  "semiconductor deal": ["semiconductor deal", "chip deal", "foundry deal"],
  "cloud partnership": ["cloud partnership", "aws partnership", "azure partnership", "cloud deal"],
  "cloud computing": ["cloud computing", "cloud", "aws", "azure", "gcp"],
  "machine learning": ["machine learning", "deep learning"],
  nvidia: ["nvidia", "nvda", "jensen huang"],
  "data center": ["data center", "datacenter", "gpu cluster"],
  cloud: ["cloud computing", "cloud", "aws", "azure", "gcp"],
  semiconductor: ["semiconductor", "chipmaker", "chip stock", "foundry", "ai chip"],
  "short squeeze": ["short squeeze", "gamma squeeze", "short interest"],
  reddit: ["reddit", "wallstreetbets", "wsb", "retail traders"],
  viral: ["viral", "meme stock", "trending on"],
};

const KEYWORD_CATEGORY: Record<string, CatalystCategory> = {};
for (const g of CATALYST_GROUPS) {
  for (const k of g.keywords) KEYWORD_CATEGORY[k.toLowerCase()] = g.id;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function haystack(item: RawItem): string {
  return ` ${item.title} ${item.summary} ${item.tickers.join(" ")} `.toLowerCase();
}

function keywordHits(hay: string, keyword: string): boolean {
  const aliases = KEYWORD_ALIASES[keyword.toLowerCase()] ?? [keyword.toLowerCase()];
  return aliases.some((alias) => {
    const a = alias.toLowerCase();
    if (a.includes(" ")) return hay.includes(a);
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(a)}(?:[^a-z0-9]|$)`, "i");
    return re.test(hay);
  });
}

function matchKeywords(item: RawItem, keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  const hay = haystack(item);
  return keywords.filter((k) => keywordHits(hay, k));
}

function categoryFor(matched: string[]): CatalystCategory | undefined {
  const counts: Partial<Record<CatalystCategory, number>> = {};
  for (const k of matched) {
    const c = KEYWORD_CATEGORY[k.toLowerCase()];
    if (c) counts[c] = (counts[c] ?? 0) + 1;
  }
  let best: CatalystCategory | undefined;
  let n = 0;
  for (const [c, v] of Object.entries(counts) as Array<[CatalystCategory, number]>) {
    if (v > n) {
      n = v;
      best = c;
    }
  }
  return best;
}

const CATEGORY_QUERY: Record<CatalystCategory, string> = {
  earn: '(earnings OR EPS OR guidance OR revenue OR "beats estimates" OR outlook) (stock OR shares)',
  fda: '(FDA OR "drug approval" OR "clinical trial" OR PDUFA OR biologic) (stock OR shares)',
  deal: "(partnership OR collaboration OR contract OR agreement) (stock OR shares OR company)",
  ma: "(merger OR acquisition OR takeover OR buyout OR acquire) (stock OR shares)",
  macro: '(Fed OR FOMC OR inflation OR CPI OR "product launch" OR expansion) (stock OR market)',
  ai: '(Nvidia OR "artificial intelligence" OR semiconductor OR "data center" OR "machine learning" OR AI) stock',
  viral: '("short squeeze" OR reddit OR wallstreetbets OR "meme stock") stock',
};

function activeCategories(keywords: string[]): CatalystCategory[] {
  const on = new Set<CatalystCategory>();
  for (const k of keywords) {
    const c = KEYWORD_CATEGORY[k.toLowerCase()];
    if (c) on.add(c);
  }
  return [...on];
}

function googleQueries(ticker: string, keywords: string[], windowDays: number): string[] {
  const when = googleWhen(windowDays);
  const cats = activeCategories(keywords);
  const qs: string[] = [];
  if (ticker) {
    const or =
      keywords.length > 0 && keywords.length <= 10
        ? keywords.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" OR ")
        : "";
    qs.push(or ? `${ticker} (${or}) ${when}` : `${ticker} stock ${when}`);
    qs.push(`${ticker} (earnings OR guidance OR partnership OR AI OR deal) ${when}`);
  } else {
    for (const c of cats) qs.push(`${CATEGORY_QUERY[c]} ${when}`);
    if (qs.length === 0) qs.push(`stock market news ${when}`);
  }
  return qs.slice(0, 8);
}

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s[-–—]\s+.{2,40}$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 96);
}

function toNews(item: RawItem, matched: string[]): NewsItem {
  const title = stripTags(item.title);
  const summary = looksLikeMarkup(item.summary)
    ? ""
    : cleanSummary(item.summary, title, item.source);
  const tickers = [
    ...new Set([...item.tickers, ...extractTickers(`${title} ${summary}`)].map((t) => t.toUpperCase())),
  ].slice(0, 6);
  const tone = scoreSentiment(title, summary);
  return {
    id: `${item.source}:${titleKey(title)}`.slice(0, 180),
    title,
    publisher: stripTags(item.publisher),
    link: item.link,
    publishedAt: item.publishedAt,
    tickers,
    summary: summary || undefined,
    source: item.source,
    category: categoryFor(matched),
    matched,
    sentiment: tone.sentiment,
    sentimentScore: tone.score,
  };
}

function mergeRaw(batches: RawItem[][]): { items: RawItem[]; sources: Record<string, number> } {
  const seen = new Set<string>();
  const items: RawItem[] = [];
  const sources: Record<string, number> = {};
  for (const batch of batches) {
    for (const it of batch) {
      const key = titleKey(it.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(it);
      sources[it.source] = (sources[it.source] ?? 0) + 1;
    }
  }
  return { items, sources };
}

export async function scanNews(opts: {
  ticker: string;
  keywords: string[];
  max: number;
  windowDays: number;
}): Promise<ScanResult> {
  const ticker = opts.ticker;
  const keywords = opts.keywords.map((k) => k.trim()).filter(Boolean);
  const windowDays = Number.isFinite(opts.windowDays) ? Math.min(30, Math.max(0.04, opts.windowDays)) : 1;
  const max = Math.min(80, Math.max(5, opts.max));
  const cutoff = Math.floor(Date.now() / 1000 - windowDays * 86400);

  const jobs: Array<Promise<RawItem[]>> = [];
  for (const q of googleQueries(ticker, keywords, windowDays)) jobs.push(googleNews(q));

  if (ticker) {
    jobs.push(yahooRss(ticker));
    jobs.push(yahooSearchNews(ticker, 20));
    jobs.push(yahooSearchNews(`${ticker} news`, 20));
    jobs.push(finvizQuote(ticker));
    jobs.push(nasdaqRss(ticker));
    jobs.push(seekingAlpha(ticker));
    jobs.push(marketBeatTicker(ticker));
  } else {
    jobs.push(yahooRss());
    jobs.push(yahooSearchNews(keywords[0] || "stock market", 20));
    jobs.push(finvizMarket());
    jobs.push(nasdaqRss());
    jobs.push(genericRss("https://www.benzinga.com/feed", "Benzinga", "Benzinga"));
    jobs.push(
      genericRss(
        "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
        "CNBC",
        "CNBC",
      ),
    );
    jobs.push(
      genericRss(
        "https://feeds.content.dowjones.io/public/rss/mw_topstories",
        "MarketWatch",
        "MarketWatch",
      ),
    );
    jobs.push(marketBeatMarket());
  }

  const settled = await Promise.allSettled(jobs);
  const batches: RawItem[][] = [];
  for (const r of settled) if (r.status === "fulfilled") batches.push(r.value);

  const { items: merged, sources } = mergeRaw(batches);
  const inWindow = merged.filter((it) => it.publishedAt >= cutoff);

  const name = ticker ? (DISPLAY_NAMES[ticker] ?? "").toLowerCase() : "";
  const aboutTicker = (it: RawItem) => {
    if (!ticker) return true;
    const title = it.title.toUpperCase();
    if (it.tickers.includes(ticker)) return true;
    if (title.includes(ticker)) return true;
    if (name && it.title.toLowerCase().includes(name)) return true;
    return false;
  };

  const scoped = ticker ? inWindow.filter(aboutTicker) : inWindow;

  const scored = scoped.map((it) => {
    const matched = matchKeywords(it, keywords);
    let score = matched.length * 4 + Math.min(it.publishedAt, Date.now() / 1000) / 1e10;
    if (ticker && it.tickers.includes(ticker)) score += 3;
    if (ticker && it.title.toUpperCase().includes(ticker)) score += 2;
    if (it.source === "Google News") score += 1;
    return { it, matched, score };
  });

  let matchedRows = keywords.length ? scored.filter((r) => r.matched.length > 0) : scored;

  // Ticker scans: if keywords are strict, still surface the latest company headlines.
  if (ticker && matchedRows.length < Math.min(8, max) && scored.length > matchedRows.length) {
    const seen = new Set(matchedRows.map((r) => r.it.link));
    const extra = scored
      .filter((r) => !seen.has(r.it.link))
      .sort((a, b) => b.it.publishedAt - a.it.publishedAt)
      .slice(0, Math.min(8, max) - matchedRows.length);
    matchedRows = [...matchedRows, ...extra];
  }

  matchedRows.sort((a, b) => b.score - a.score || b.it.publishedAt - a.it.publishedAt);

  const items = await enrichItems(matchedRows.slice(0, max).map((r) => toNews(r.it, r.matched)));

  return {
    items,
    fetched: merged.length,
    matched: matchedRows.length,
    sources,
    windowDays,
  };
}

export async function tickerHeadlines(symbol: string, count = 12): Promise<NewsItem[]> {
  const settled = await Promise.allSettled([
    yahooRss(symbol),
    googleNews(`${symbol} stock when:7d`),
    yahooSearchNews(symbol, 15),
    nasdaqRss(symbol),
    finvizQuote(symbol),
    seekingAlpha(symbol),
  ]);
  const batches: RawItem[][] = [];
  for (const r of settled) if (r.status === "fulfilled") batches.push(r.value);
  const { items } = mergeRaw(batches);
  const name = (DISPLAY_NAMES[symbol] ?? "").toLowerCase();
  const related = items.filter((it) => {
    const title = it.title.toUpperCase();
    if (it.tickers.includes(symbol)) return true;
    if (title.includes(symbol)) return true;
    if (name && it.title.toLowerCase().includes(name)) return true;
    return false;
  });
  const pool = related.length >= 4 ? related : items;
  pool.sort((a, b) => b.publishedAt - a.publishedAt);
  return pool.slice(0, count).map((it) => toNews(it, []));
}
