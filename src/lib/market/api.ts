import { createServerFn } from "@tanstack/react-start";
import { DISPLAY_NAMES, yahooSymbol } from "./universe";
import type { Fundamentals, History, NewsItem, PeerStat, Quote } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type CacheEntry<T> = { expires: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, value: T): T {
  cache.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

function fromCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

async function yahooJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  return enqueue(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            "User-Agent": UA,
            Accept: "application/json,text/plain,*/*",
          },
        });
        if (res.status === 429) {
          await sleep(400 * (attempt + 1));
          lastErr = new Error("Yahoo 429");
          continue;
        }
        if (!res.ok) throw new Error(`Yahoo ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await sleep(250);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Yahoo fetch failed");
  });
}

let yahooChain: Promise<void> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = yahooChain.then(fn, fn);
  yahooChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function lastNumber(arr: Array<number | null | undefined> | undefined): number | null {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function sparkline(arr: Array<number | null | undefined> | undefined, max = 24): number[] {
  if (!arr) return [];
  const nums = arr.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length <= max) return nums;
  return nums.slice(-max);
}

type SparkPayload = Record<
  string,
  {
    symbol?: string;
    previousClose?: number;
    chartPreviousClose?: number;
    close?: Array<number | null>;
  }
>;

function quoteFromSpark(symbol: string, row: SparkPayload[string]): Quote | null {
  const price = lastNumber(row.close);
  const prev = row.previousClose ?? row.chartPreviousClose ?? null;
  if (price === null || prev === null || prev === 0) return null;
  const change = price - prev;
  return {
    symbol,
    name: DISPLAY_NAMES[symbol] ?? symbol,
    price,
    previousClose: prev,
    change,
    changePercent: (change / prev) * 100,
    sparkline: sparkline(row.close),
  };
}

const quoteCache = new Map<string, { expires: number; quote: Quote }>();
const QUOTE_TTL = 25_000;

async function fetchSparkChunk(symbols: string[]): Promise<Quote[]> {
  if (symbols.length === 0) return [];
  const url =
    "https://query1.finance.yahoo.com/v8/finance/spark?symbols=" +
    encodeURIComponent(symbols.join(",")) +
    "&range=1d&interval=5m";
  const data = (await yahooJson(url)) as SparkPayload;
  const out: Quote[] = [];
  const now = Date.now();
  for (const symbol of symbols) {
    const row = data[symbol];
    if (!row) continue;
    const q = quoteFromSpark(symbol, row);
    if (q) {
      quoteCache.set(symbol, { expires: now + QUOTE_TTL, quote: q });
      out.push(q);
    }
  }
  return out;
}

async function fetchQuotesUncached(rawSymbols: string[]): Promise<Quote[]> {
  const symbols = [...new Set(rawSymbols.map(yahooSymbol).filter(Boolean))];
  const now = Date.now();
  const out: Quote[] = [];
  const missing: string[] = [];
  for (const s of symbols) {
    const hit = quoteCache.get(s);
    if (hit && hit.expires > now) out.push(hit.quote);
    else missing.push(s);
  }
  for (let i = 0; i < missing.length; i += 15) {
    const chunk = missing.slice(i, i + 15);
    try {
      const got = await fetchSparkChunk(chunk);
      out.push(...got);
    } catch {
      // leave those symbols absent; UI shows a dash
    }
  }
  const bySym = new Map(out.map((q) => [q.symbol, q]));
  return symbols.map((s) => bySym.get(s)).filter((q): q is Quote => Boolean(q));
}

export const getQuotes = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object" || !("symbols" in input)) {
      throw new Error("symbols required");
    }
    const symbols = (input as { symbols: unknown }).symbols;
    if (!Array.isArray(symbols)) throw new Error("symbols must be an array");
    return {
      symbols: symbols
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 120),
    };
  })
  .handler(async ({ data }) => {
    return fetchQuotesUncached(data.symbols);
  });

export const getHistory = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as { symbol?: unknown; interval?: unknown };
    if (typeof o.symbol !== "string" || !o.symbol.trim()) throw new Error("symbol required");
    const interval =
      o.interval === "5" ||
      o.interval === "15" ||
      o.interval === "60" ||
      o.interval === "D" ||
      o.interval === "W"
        ? o.interval
        : "D";
    return { symbol: yahooSymbol(o.symbol), interval };
  })
  .handler(async ({ data }): Promise<History> => {
    const key = `h:${data.symbol}:${data.interval}`;
    const hit = fromCache<History>(key);
    if (hit) return hit;

    const map: Record<string, { interval: string; range: string }> = {
      "5": { interval: "5m", range: "5d" },
      "15": { interval: "15m", range: "10d" },
      "60": { interval: "60m", range: "1mo" },
      D: { interval: "1d", range: "1y" },
      W: { interval: "1wk", range: "5y" },
    };
    const spec = map[data.interval] ?? map.D!;
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(data.symbol)}` +
      `?interval=${spec.interval}&range=${spec.range}&includePrePost=false`;
    const json = (await yahooJson(url, 12_000)) as {
      chart?: {
        result?: Array<{
          meta?: {
            symbol?: string;
            shortName?: string;
            longName?: string;
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
            regularMarketVolume?: number;
            fiftyTwoWeekHigh?: number;
            fiftyTwoWeekLow?: number;
            regularMarketDayHigh?: number;
            regularMarketDayLow?: number;
            firstTradeDate?: number;
            exchangeName?: string;
            fullExchangeName?: string;
          };
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    if (!result) throw new Error(`No chart data for ${data.symbol}`);
    const meta = result.meta ?? {};
    const ts = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0];
    const bars = [];
    for (let i = 0; i < ts.length; i++) {
      const open = q?.open?.[i];
      const high = q?.high?.[i];
      const low = q?.low?.[i];
      const close = q?.close?.[i];
      const volume = q?.volume?.[i];
      if (
        typeof open !== "number" ||
        typeof high !== "number" ||
        typeof low !== "number" ||
        typeof close !== "number"
      ) {
        continue;
      }
      bars.push({
        time: ts[i]!,
        open,
        high,
        low,
        close,
        volume: typeof volume === "number" ? volume : 0,
      });
    }
    const price = meta.regularMarketPrice ?? bars.at(-1)?.close ?? 0;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? bars.at(-2)?.close ?? price;
    const change = price - prev;
    const history: History = {
      symbol: data.symbol,
      name: meta.longName ?? meta.shortName ?? DISPLAY_NAMES[data.symbol] ?? data.symbol,
      price,
      previousClose: prev,
      change,
      changePercent: prev ? (change / prev) * 100 : 0,
      volume: meta.regularMarketVolume ?? null,
      high52: meta.fiftyTwoWeekHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? null,
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      firstTradeDate: typeof meta.firstTradeDate === "number" ? meta.firstTradeDate : null,
      exchangeName: meta.exchangeName ?? null,
      fullExchangeName: meta.fullExchangeName ?? null,
      bars,
    };
    return cached(key, 45_000, history);
  });

export const getNews = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as { query?: unknown; count?: unknown };
    const query = typeof o.query === "string" && o.query.trim() ? o.query.trim() : "stock market";
    const count = typeof o.count === "number" ? Math.min(40, Math.max(4, o.count)) : 20;
    return { query, count };
  })
  .handler(async ({ data }): Promise<NewsItem[]> => {
    const key = `n:${data.query}:${data.count}`;
    const hit = fromCache<NewsItem[]>(key);
    if (hit) return hit;
    const url =
      "https://query1.finance.yahoo.com/v1/finance/search?q=" +
      encodeURIComponent(data.query) +
      `&quotesCount=0&newsCount=${data.count}&enableFuzzyQuery=false`;
    const json = (await yahooJson(url)) as {
      news?: Array<{
        uuid?: string;
        title?: string;
        publisher?: string;
        link?: string;
        providerPublishTime?: number;
        relatedTickers?: string[];
      }>;
    };
    const items: NewsItem[] = (json.news ?? [])
      .filter((n) => n.title && n.link)
      .map((n) => ({
        id: n.uuid ?? n.link ?? n.title ?? crypto.randomUUID(),
        title: n.title ?? "",
        publisher: n.publisher ?? "Yahoo Finance",
        link: n.link ?? "",
        publishedAt: n.providerPublishTime ?? Math.floor(Date.now() / 1000),
        tickers: n.relatedTickers ?? [],
      }));
    return cached(key, 60_000, items);
  });

export const scanCatalysts = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as {
      ticker?: unknown;
      keywords?: unknown;
      max?: unknown;
    };
    const ticker =
      typeof o.ticker === "string" ? o.ticker.trim().toUpperCase().replace(/[^A-Z.]/g, "") : "";
    const keywords = Array.isArray(o.keywords)
      ? o.keywords.filter((k): k is string => typeof k === "string").slice(0, 24)
      : [];
    const max = typeof o.max === "number" ? Math.min(50, Math.max(5, o.max)) : 20;
    return { ticker, keywords, max };
  })
  .handler(async ({ data }): Promise<NewsItem[]> => {
    const queries: string[] = [];
    if (data.ticker) queries.push(data.ticker);
    const seeds = data.keywords.length
      ? data.keywords.slice(0, 6)
      : ["earnings", "fda", "merger", "partnership"];
    for (const k of seeds) queries.push(data.ticker ? `${data.ticker} ${k}` : k);
    const unique = [...new Set(queries)].slice(0, 6);

    const results = await Promise.allSettled(
      unique.map(async (q) => {
        const url =
          "https://query1.finance.yahoo.com/v1/finance/search?q=" +
          encodeURIComponent(q) +
          "&quotesCount=0&newsCount=15";
        const json = (await yahooJson(url)) as {
          news?: Array<{
            uuid?: string;
            title?: string;
            publisher?: string;
            link?: string;
            providerPublishTime?: number;
            relatedTickers?: string[];
          }>;
        };
        return json.news ?? [];
      }),
    );

    const seen = new Set<string>();
    const merged: NewsItem[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const n of r.value) {
        const title = n.title ?? "";
        const key = title.toLowerCase();
        if (!title || !n.link || seen.has(key)) continue;
        seen.add(key);
        merged.push({
          id: n.uuid ?? n.link,
          title,
          publisher: n.publisher ?? "Yahoo Finance",
          link: n.link,
          publishedAt: n.providerPublishTime ?? Math.floor(Date.now() / 1000),
          tickers: n.relatedTickers ?? [],
        });
      }
    }

    const keys = data.keywords.map((k) => k.toLowerCase());
    const filtered =
      keys.length === 0
        ? merged
        : merged.filter((item) => {
            const hay = (item.title + " " + item.tickers.join(" ")).toLowerCase();
            return keys.some((k) => hay.includes(k.toLowerCase()));
          });

    filtered.sort((a, b) => b.publishedAt - a.publishedAt);
    return filtered.slice(0, data.max);
  });

const TS_TYPES = [
  "trailingMarketCap",
  "trailingEnterpriseValue",
  "trailingTotalRevenue",
  "trailingFreeCashFlow",
  "trailingNetIncome",
  "trailingOperatingIncome",
  "trailingGrossProfit",
  "trailingDilutedEPS",
  "trailingEnterprisesValueEBITDARatio",
  "trailingPeRatio",
  "trailingForwardPeRatio",
  "trailingPsRatio",
  "quarterlyOrdinarySharesNumber",
  "quarterlyStockholdersEquity",
  "quarterlyTotalAssets",
  "quarterlyCurrentAssets",
  "quarterlyCurrentLiabilities",
].join(",");

type TsPoint = { asOfDate?: string; reportedValue?: { raw?: number; fmt?: string } };
type TsRow = {
  meta?: { type?: string[] };
  timestamp?: number[];
  [key: string]: unknown;
};

function latestRaw(row: TsRow, type: string): number | null {
  const arr = row[type];
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    const raw = (arr[i] as TsPoint | undefined)?.reportedValue?.raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function ratioPct(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return (num / den) * 100;
}

function emptyFundamentals(): Fundamentals {
  return {
    marketCap: null,
    enterpriseValue: null,
    revenueTtm: null,
    freeCashFlow: null,
    sharesOutstanding: null,
    sharesFloat: null,
    profitMargin: null,
    operatingMargin: null,
    grossMargin: null,
    evEbitda: null,
    epsTtm: null,
    peTtm: null,
    forwardPe: null,
    psTtm: null,
    roe: null,
    roa: null,
    currentRatio: null,
    industry: null,
    sector: null,
    exchange: null,
    nextEarningsDate: null,
    nextEarningsEst: false,
    lastEarningsDate: null,
    lastEpsActual: null,
    lastEpsEstimate: null,
    lastEpsSurprisePct: null,
  };
}

function parseUsDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadEarnings(symbol: string): Promise<Pick<
  Fundamentals,
  | "nextEarningsDate"
  | "nextEarningsEst"
  | "lastEarningsDate"
  | "lastEpsActual"
  | "lastEpsEstimate"
  | "lastEpsSurprisePct"
>> {
  const nasdaq = symbol.replace(/-/g, ".");
  const url = `https://api.nasdaq.com/api/company/${encodeURIComponent(nasdaq)}/earnings-surprise`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Origin: "https://www.nasdaq.com",
        Referer: "https://www.nasdaq.com/",
      },
    });
    if (!res.ok) throw new Error(`nasdaq ${res.status}`);
    const json = (await res.json()) as {
      data?: {
        earningsSurpriseTable?: {
          rows?: Array<{
            dateReported?: string;
            eps?: string | number;
            consensusForecast?: string;
            percentageSurprise?: string;
          }>;
        };
      };
    };
    const row = json.data?.earningsSurpriseTable?.rows?.[0];
    if (!row) {
      return {
        nextEarningsDate: null,
        nextEarningsEst: false,
        lastEarningsDate: null,
        lastEpsActual: null,
        lastEpsEstimate: null,
        lastEpsSurprisePct: null,
      };
    }
    const lastDate = row.dateReported ? parseUsDate(row.dateReported) : null;
    const actual = typeof row.eps === "number" ? row.eps : Number.parseFloat(String(row.eps ?? ""));
    const estimate = Number.parseFloat(String(row.consensusForecast ?? ""));
    const surprise = Number.parseFloat(String(row.percentageSurprise ?? ""));
    return {
      lastEarningsDate: lastDate,
      lastEpsActual: Number.isFinite(actual) ? actual : null,
      lastEpsEstimate: Number.isFinite(estimate) ? estimate : null,
      lastEpsSurprisePct: Number.isFinite(surprise) ? surprise : null,
      nextEarningsDate: lastDate ? addDaysIso(lastDate, 91) : null,
      nextEarningsEst: Boolean(lastDate),
    };
  } catch {
    return {
      nextEarningsDate: null,
      nextEarningsEst: false,
      lastEarningsDate: null,
      lastEpsActual: null,
      lastEpsEstimate: null,
      lastEpsSurprisePct: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function loadFundamentals(
  symbol: string,
  opts: { earnings?: boolean } = {},
): Promise<Fundamentals> {
  const withEarn = opts.earnings !== false;
  const key = `f:${symbol}${withEarn ? "" : ":lite"}`;
  const hit = fromCache<Fundamentals>(key);
  if (hit) return hit;

  const out = emptyFundamentals();
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 86400 * 800;
  const tsUrl =
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?type=${TS_TYPES}&period1=${period1}&period2=${period2}`;
  const searchUrl =
    "https://query1.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(symbol) +
    "&quotesCount=1&newsCount=0&enableFuzzyQuery=false";

  const [tsResult, searchResult, earnings] = await Promise.allSettled([
    yahooJson(tsUrl, 12_000),
    yahooJson(searchUrl, 8_000),
    withEarn ? loadEarnings(symbol) : Promise.resolve(null),
  ]);

  if (tsResult.status === "fulfilled") {
    const json = tsResult.value as { timeseries?: { result?: TsRow[] } };
    const byType = new Map<string, number>();
    for (const row of json.timeseries?.result ?? []) {
      const type = row.meta?.type?.[0];
      if (!type) continue;
      const raw = latestRaw(row, type);
      if (raw !== null) byType.set(type, raw);
    }
    const get = (t: string) => byType.get(t) ?? null;
    const revenue = get("trailingTotalRevenue");
    const netIncome = get("trailingNetIncome");
    const opIncome = get("trailingOperatingIncome");
    const grossProfit = get("trailingGrossProfit");
    const equity = get("quarterlyStockholdersEquity");
    const assets = get("quarterlyTotalAssets");
    const currentAssets = get("quarterlyCurrentAssets");
    const currentLiab = get("quarterlyCurrentLiabilities");

    out.marketCap = get("trailingMarketCap");
    out.enterpriseValue = get("trailingEnterpriseValue");
    out.revenueTtm = revenue;
    out.freeCashFlow = get("trailingFreeCashFlow");
    out.sharesOutstanding = get("quarterlyOrdinarySharesNumber");
    out.profitMargin = ratioPct(netIncome, revenue);
    out.operatingMargin = ratioPct(opIncome, revenue);
    out.grossMargin = ratioPct(grossProfit, revenue);
    out.evEbitda = get("trailingEnterprisesValueEBITDARatio");
    out.epsTtm = get("trailingDilutedEPS");
    out.peTtm = get("trailingPeRatio");
    out.forwardPe = get("trailingForwardPeRatio");
    out.psTtm = get("trailingPsRatio");
    out.roe = ratioPct(netIncome, equity);
    out.roa = ratioPct(netIncome, assets);
    out.currentRatio =
      currentAssets !== null && currentLiab !== null && currentLiab !== 0
        ? currentAssets / currentLiab
        : null;
  }

  if (searchResult.status === "fulfilled") {
    const json = searchResult.value as {
      quotes?: Array<{
        symbol?: string;
        sector?: string;
        industry?: string;
        industryDisp?: string;
        exchDisp?: string;
        exchange?: string;
      }>;
    };
    const quote =
      json.quotes?.find((q) => (q.symbol ?? "").toUpperCase() === symbol) ??
      json.quotes?.[0];
    if (quote) {
      out.sector = quote.sector ?? null;
      out.industry = quote.industryDisp ?? quote.industry ?? null;
      out.exchange = quote.exchDisp ?? quote.exchange ?? null;
    }
  }

  if (earnings.status === "fulfilled" && earnings.value) {
    Object.assign(out, earnings.value);
  }

  return cached(key, 10 * 60_000, out);
}

export const getFundamentals = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as { symbol?: unknown };
    if (typeof o.symbol !== "string" || !o.symbol.trim()) throw new Error("symbol required");
    return { symbol: yahooSymbol(o.symbol) };
  })
  .handler(async ({ data }): Promise<Fundamentals> => {
    return loadFundamentals(data.symbol);
  });

export const getPeerStats = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as { symbols?: unknown };
    if (!Array.isArray(o.symbols)) throw new Error("symbols required");
    return {
      symbols: o.symbols
        .filter((s): s is string => typeof s === "string")
        .map((s) => yahooSymbol(s))
        .filter(Boolean)
        .slice(0, 6),
    };
  })
  .handler(async ({ data }): Promise<PeerStat[]> => {
    const [quotes, funds] = await Promise.all([
      fetchQuotesUncached(data.symbols),
      Promise.all(
        data.symbols.map((s) =>
          loadFundamentals(s, { earnings: false }).catch(() => emptyFundamentals()),
        ),
      ),
    ]);
    const bySym = new Map(quotes.map((q) => [q.symbol, q]));
    return data.symbols.map((symbol, i) => {
      const q = bySym.get(symbol);
      const f = funds[i] ?? emptyFundamentals();
      const pe =
        q && f.epsTtm != null && f.epsTtm > 0 ? q.price / f.epsTtm : (f.peTtm ?? null);
      const mcap =
        q && f.sharesOutstanding != null ? q.price * f.sharesOutstanding : f.marketCap;
      const ps =
        mcap != null && f.revenueTtm != null && f.revenueTtm > 0
          ? mcap / f.revenueTtm
          : (f.psTtm ?? null);
      return {
        symbol,
        price: q?.price ?? 0,
        changePercent: q?.changePercent ?? 0,
        peTtm: pe,
        forwardPe: f.forwardPe,
        psTtm: ps,
        profitMargin: f.profitMargin,
      };
    });
  });

