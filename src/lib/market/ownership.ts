import type { Fundamentals, InsiderTrade } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchHtml(url: string, timeoutMs = 6_000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
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

function stripTags(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNum(raw: string): number | null {
  const t = raw.replace(/[$,+%]/g, "").replace(/,/g, "").replace(/[()]/g, "").trim();
  if (!t || t === "-" || t === "—" || /^n\/?a$/i.test(t)) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function parsePct(raw: string): number | null {
  return parseNum(raw);
}

function classifyKind(raw: string): InsiderTrade["kind"] {
  const t = raw.toLowerCase();
  if (/\bpurchase\b|\bbuy\b|\bp - /.test(t) && !/sale/.test(t)) return "buy";
  if (/\bsale\b|\bsell\b|\bs - /.test(t) || /\bproposed sale\b/.test(t)) return "sell";
  if (/\bgrant\b|\ba - /.test(t)) return "grant";
  return "other";
}

function parseFinvizDate(raw: string): string | null {
  const m = raw.trim().match(/^([A-Za-z]{3})\s+(\d{1,2})\s+'?(\d{2})$/);
  if (!m) return null;
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const mm = months[m[1]!];
  if (!mm) return null;
  return `20${m[3]}-${mm}-${m[2]!.padStart(2, "0")}`;
}

function parseIsoDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : parseFinvizDate(raw);
}

function parseFinvizEarning(raw: string): { date: string; past: boolean } | null {
  const m = raw.trim().match(/([A-Za-z]{3})\s+(\d{1,2})/);
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const month = months[m[1]!];
  if (month == null) return null;
  const day = Number.parseInt(m[2]!, 10);
  const now = new Date();
  let year = now.getUTCFullYear();
  let dt = new Date(Date.UTC(year, month, day, 12));
  const delta = (dt.getTime() - Date.now()) / 86400000;
  if (delta < -40) {
    year += 1;
    dt = new Date(Date.UTC(year, month, day, 12));
  }
  const iso = dt.toISOString().slice(0, 10);
  return { date: iso, past: dt.getTime() < Date.now() };
}

export type FinvizTape = {
  floatShares: number | null;
  shortFloatPct: number | null;
  rvol: number | null;
  nextEarningsDate: string | null;
  nextEarningsEst: boolean;
};

function snapshotMap(html: string): Map<string, string> {
  const re =
    /snapshot-td-label">(?:<a[^>]*>)?([^<]+)(?:<\/a>)?<\/div><\/td>\s*<td[^>]*>\s*<div class="snapshot-td-content">([\s\S]*?)<\/div>/gi;
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    map.set(m[1]!.trim(), stripTags(m[2] ?? ""));
  }
  return map;
}

function parseFinvizSnapshot(html: string): Partial<Fundamentals> {
  const out: Partial<Fundamentals> = {};
  const map = snapshotMap(html);
  const get = (k: string) => map.get(k);
  out.insiderOwnPct = parsePct(get("Insider Own") ?? "");
  out.insiderTransPct = parsePct(get("Insider Trans") ?? "");
  out.instOwnPct = parsePct(get("Inst Own") ?? "");
  out.instTransPct = parsePct(get("Inst Trans") ?? "");
  out.shortFloatPct = parsePct(get("Short Float") ?? "");
  out.shortRatio = parseNum(get("Short Ratio") ?? "");
  out.relVolume = parseNum(get("Rel Volume") ?? "");
  const floatRaw = get("Shs Float") ?? "";
  const floatM = floatRaw.match(/([\d.]+)\s*([KMB])?/i);
  if (floatM) {
    const n = Number.parseFloat(floatM[1]!);
    const mul = floatM[2]?.toUpperCase() === "B" ? 1e9 : floatM[2]?.toUpperCase() === "M" ? 1e6 : floatM[2]?.toUpperCase() === "K" ? 1e3 : 1;
    if (Number.isFinite(n)) out.sharesFloat = n * mul;
  }
  const siRaw = get("Short Interest") ?? "";
  const siM = siRaw.match(/([\d.]+)\s*([KMB])?/i);
  if (siM) {
    const n = Number.parseFloat(siM[1]!);
    const mul = siM[2]?.toUpperCase() === "B" ? 1e9 : siM[2]?.toUpperCase() === "M" ? 1e6 : siM[2]?.toUpperCase() === "K" ? 1e3 : 1;
    if (Number.isFinite(n)) out.shortInterest = n * mul;
  }
  const earn = parseFinvizEarning(get("Earnings") ?? "");
  if (earn) {
    if (earn.past) {
      out.lastEarningsDate = earn.date;
      const next = new Date(`${earn.date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 91);
      out.nextEarningsDate = next.toISOString().slice(0, 10);
      out.nextEarningsEst = true;
    } else {
      out.nextEarningsDate = earn.date;
      out.nextEarningsEst = false;
    }
  }
  const surpr = get("EPS/Sales Surpr.") ?? "";
  const surprM = surpr.match(/(-?[\d.]+)\s*%/);
  if (surprM) {
    const n = Number.parseFloat(surprM[1]!);
    if (Number.isFinite(n)) out.lastEpsSurprisePct = n;
  }
  return out;
}

function parseFinvizTrades(html: string): InsiderTrade[] {
  const trades: InsiderTrade[] = [];
  const rows = html.match(/<tr class="fv-insider-row[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1] ?? ""));
    if (cells.length < 6) continue;
    if (/proposed/i.test(cells[3] ?? "")) continue;
    const kind = classifyKind(cells[3] ?? "");
    const date = parseFinvizDate(cells[2] ?? "") ?? "";
    const shares = Math.abs(parseNum(cells[5] ?? "") ?? 0);
    if (!date || !shares) continue;
    trades.push({
      name: cells[0] || "Insider",
      title: cells[1] || "",
      date,
      kind,
      shares,
      price: parseNum(cells[4] ?? ""),
      value: parseNum(cells[6] ?? ""),
    });
  }
  return trades;
}

function parseOpenInsiderTrades(html: string, symbol: string): InsiderTrade[] {
  const table = html.match(/<table[^>]*class="tinytable"[^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return [];
  const rows = [...table[1]!.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => r[1] ?? "");
  const trades: InsiderTrade[] = [];
  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripTags(c[1] ?? ""));
    if (cells.length < 12) continue;
    const ticker = (cells[3] ?? "").replace(/.*\b([A-Z.]{1,5})\b.*/, "$1");
    if (ticker && ticker !== symbol) continue;
    const kind = classifyKind(cells[6] ?? "");
    const date = parseIsoDate(cells[2] ?? "") ?? "";
    const shares = Math.abs(parseNum(cells[8] ?? "") ?? 0);
    if (!date || !shares) continue;
    trades.push({
      name: cells[4] || "Insider",
      title: cells[5] || "",
      date,
      kind,
      shares,
      price: parseNum(cells[7] ?? ""),
      value: parseNum(cells[11] ?? ""),
    });
  }
  return trades;
}

function summarize(trades: InsiderTrade[]): Pick<
  Fundamentals,
  "insiderTrades" | "insiderBuyShares" | "insiderSellShares" | "insiderBuyValue" | "insiderSellValue"
> {
  const cutoff = Date.now() - 180 * 86400 * 1000;
  const recent = trades
    .filter((t) => {
      const ts = Date.parse(`${t.date}T12:00:00Z`);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  let buySh = 0;
  let sellSh = 0;
  let buyVal = 0;
  let sellVal = 0;
  for (const t of recent) {
    if (t.kind === "buy") {
      buySh += t.shares;
      buyVal += t.value ?? 0;
    } else if (t.kind === "sell") {
      sellSh += t.shares;
      sellVal += Math.abs(t.value ?? 0);
    }
  }
  return {
    insiderTrades: recent.slice(0, 10),
    insiderBuyShares: buySh,
    insiderSellShares: sellSh,
    insiderBuyValue: buyVal,
    insiderSellValue: sellVal,
  };
}

const tapeCache = new Map<string, { expires: number; value: FinvizTape }>();

export async function loadFinvizTape(symbol: string): Promise<FinvizTape> {
  const hit = tapeCache.get(symbol);
  if (hit && hit.expires > Date.now()) return hit.value;
  const empty: FinvizTape = {
    floatShares: null,
    shortFloatPct: null,
    rvol: null,
    nextEarningsDate: null,
    nextEarningsEst: false,
  };
  try {
    const html = await fetchHtml(`https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`);
    if (!html) return empty;
    const snap = parseFinvizSnapshot(html);
    const value: FinvizTape = {
      floatShares: snap.sharesFloat ?? null,
      shortFloatPct: snap.shortFloatPct ?? null,
      rvol: snap.relVolume ?? parseNum(snapshotMap(html).get("Rel Volume") ?? ""),
      nextEarningsDate: snap.nextEarningsDate ?? null,
      nextEarningsEst: Boolean(snap.nextEarningsEst),
    };
    tapeCache.set(symbol, { expires: Date.now() + 30 * 60_000, value });
    return value;
  } catch {
    return empty;
  }
}

export async function loadOwnership(symbol: string): Promise<Partial<Fundamentals>> {
  try {
    const [finviz, openinsider] = await Promise.all([
      fetchHtml(`https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`),
      fetchHtml(`http://openinsider.com/${encodeURIComponent(symbol)}`),
    ]);

    const snap = finviz ? parseFinvizSnapshot(finviz) : {};
    let trades = finviz ? parseFinvizTrades(finviz) : [];
    if (trades.length < 2 && openinsider) {
      trades = parseOpenInsiderTrades(openinsider, symbol);
    }
    return { ...snap, ...summarize(trades) };
  } catch {
    return {};
  }
}