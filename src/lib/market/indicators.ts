import type { Bar, KeyLevel, TechnicalSnapshot } from "./types";

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i]! * k + out[i - 1]! * (1 - k));
  }
  return out;
}

function ema(values: number[], period: number): number {
  return last(emaSeries(values, period)) ?? 0;
}

function smaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch > 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateMacd(closes: number[]) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const line = fast.map((v, i) => v - (slow[i] ?? 0));
  const signalLine = emaSeries(line, 9);
  const macd = last(line) ?? 0;
  const signal = last(signalLine) ?? 0;
  return { macd, signal, histogram: macd - signal };
}

export function calculateAtr(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i]!.high;
    const low = bars[i]!.low;
    const prev = bars[i - 1]!.close;
    trs.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]!) / period;
  }
  return atr;
}

export function calculateVwap(bars: Bar[], resetDaily: boolean): number | null {
  if (bars.length === 0) return null;
  const dayOf = (unix: number) =>
    new Date(unix * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  let pv = 0;
  let vol = 0;
  let lastDay = "";
  for (const b of bars) {
    if (resetDaily) {
      const d = dayOf(b.time);
      if (lastDay && d !== lastDay) {
        pv = 0;
        vol = 0;
      }
      lastDay = d;
    }
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * (b.volume || 0);
    vol += b.volume || 0;
  }
  if (vol <= 0) return null;
  return pv / vol;
}

export function calculateStochastic(bars: Bar[], kPeriod = 14, dPeriod = 3) {
  if (bars.length < kPeriod) return { k: null as number | null, d: null as number | null };
  const ks: number[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, bars[j]!.high);
      ll = Math.min(ll, bars[j]!.low);
    }
    const close = bars[i]!.close;
    ks.push(hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100);
  }
  const k = last(ks) ?? 50;
  const dSlice = ks.slice(-dPeriod);
  const d = dSlice.reduce((a, b) => a + b, 0) / dSlice.length;
  return { k, d };
}

export function calculateBollinger(closes: number[], period = 20, mult = 2) {
  if (closes.length < period) {
    return { upper: null, middle: null, lower: null, width: null } as const;
  }
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = middle + mult * sd;
  const lower = middle - mult * sd;
  const width = middle !== 0 ? (upper - lower) / middle : null;
  return { upper, middle, lower, width };
}

export function calculateFibonacci(bars: Bar[]) {
  const recent = bars.slice(-120);
  if (recent.length < 10) return null;
  let high = -Infinity;
  let low = Infinity;
  let hiI = 0;
  let loI = 0;
  recent.forEach((b, i) => {
    if (b.high >= high) {
      high = b.high;
      hiI = i;
    }
    if (b.low <= low) {
      low = b.low;
      loI = i;
    }
  });
  const range = high - low;
  if (!(range > 0)) return null;
  const up = hiI >= loI;
  const ratios: Array<{ ratio: number; label: string }> = [
    { ratio: 0, label: "0%" },
    { ratio: 0.236, label: "23.6%" },
    { ratio: 0.382, label: "38.2%" },
    { ratio: 0.5, label: "50%" },
    { ratio: 0.618, label: "61.8%" },
    { ratio: 0.786, label: "78.6%" },
    { ratio: 1, label: "100%" },
  ];
  const levels = ratios.map(({ ratio, label }) => ({
    ratio,
    label,
    price: up ? high - ratio * range : low + ratio * range,
  }));
  return { high, low, up, levels };
}

export function calculatePivots(bars: Bar[]) {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2]!;
  const pp = (prev.high + prev.low + prev.close) / 3;
  const span = prev.high - prev.low;
  return {
    pp,
    r1: 2 * pp - prev.low,
    s1: 2 * pp - prev.high,
    r2: pp + span,
    s2: pp - span,
    r3: prev.high + 2 * (pp - prev.low),
    s3: prev.low - 2 * (prev.high - pp),
  };
}

function nyDay(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export function sessionLevels(bars: Bar[], interval: string) {
  const empty = {
    pdh: null as number | null,
    pdl: null as number | null,
    pdc: null as number | null,
    open: null as number | null,
    gap: null as TechnicalSnapshot["gap"],
  };
  if (bars.length < 2) return empty;

  let priorHigh: number;
  let priorLow: number;
  let priorClose: number;
  let sessionOpen: number | null;
  let sessionHigh: number;
  let sessionLow: number;

  if (interval === "5" || interval === "15" || interval === "60") {
    const days = new Map<string, Bar[]>();
    for (const b of bars) {
      const d = nyDay(b.time);
      const arr = days.get(d) ?? [];
      arr.push(b);
      days.set(d, arr);
    }
    const keys = [...days.keys()].sort();
    const today = nyDay(Date.now() / 1000);
    const currentKey = days.has(today) ? today : keys[keys.length - 1]!;
    const prevKey = keys.filter((k) => k < currentKey).at(-1);
    const current = days.get(currentKey);
    const prior = prevKey ? days.get(prevKey) : undefined;
    if (!prior?.length || !current?.length) return empty;
    priorHigh = Math.max(...prior.map((b) => b.high));
    priorLow = Math.min(...prior.map((b) => b.low));
    priorClose = prior[prior.length - 1]!.close;
    sessionOpen = current[0]!.open;
    sessionHigh = Math.max(...current.map((b) => b.high));
    sessionLow = Math.min(...current.map((b) => b.low));
  } else {
    const last = bars[bars.length - 1]!;
    const today = nyDay(Date.now() / 1000);
    const lastIsToday = nyDay(last.time) === today;
    const prior = lastIsToday ? bars[bars.length - 2]! : last;
    const current = lastIsToday ? last : null;
    priorHigh = prior.high;
    priorLow = prior.low;
    priorClose = prior.close;
    sessionOpen = current?.open ?? null;
    sessionHigh = current?.high ?? prior.high;
    sessionLow = current?.low ?? prior.low;
  }

  let gap: TechnicalSnapshot["gap"] = null;
  if (sessionOpen != null && sessionOpen > 0) {
    const minGap = Math.max(priorClose * 0.0015, (priorHigh - priorLow) * 0.08);
    if (sessionOpen - priorHigh >= minGap) {
      gap = {
        kind: "up",
        from: priorHigh,
        to: sessionOpen,
        filled: sessionLow <= priorHigh,
      };
    } else if (priorLow - sessionOpen >= minGap) {
      gap = {
        kind: "down",
        from: sessionOpen,
        to: priorLow,
        filled: sessionHigh >= priorLow,
      };
    }
  }

  return {
    pdh: priorHigh,
    pdl: priorLow,
    pdc: priorClose,
    open: sessionOpen,
    gap,
  };
}

export function findLevels(bars: Bar[]): { support: number; resistance: number } {
  const recent = bars.slice(-50);
  if (recent.length === 0) return { support: 0, resistance: 0 };
  const highs = recent.map((b) => b.high).sort((a, b) => b - a);
  const lows = recent.map((b) => b.low).sort((a, b) => a - b);
  const top = highs.slice(0, 5);
  const bot = lows.slice(0, 5);
  const resistance = top.reduce((a, b) => a + b, 0) / top.length;
  const support = bot.reduce((a, b) => a + b, 0) / bot.length;
  return { support, resistance };
}

type Seed = { price: number; source: string; weight: number };

function swingPoints(bars: Bar[], window = 5) {
  const highs: Seed[] = [];
  const lows: Seed[] = [];
  if (bars.length < window * 2 + 1) return { highs, lows };
  for (let i = window; i < bars.length - window; i++) {
    const bar = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (bars[j]!.high >= bar.high) isHigh = false;
      if (bars[j]!.low <= bar.low) isLow = false;
    }
    const w = Math.max(bar.volume, 1);
    if (isHigh) highs.push({ price: bar.high, source: "swing high", weight: w });
    if (isLow) lows.push({ price: bar.low, source: "swing low", weight: w });
  }
  return { highs, lows };
}

function roundNumbers(price: number): Seed[] {
  let steps: number[];
  if (price >= 500) steps = [100, 50];
  else if (price >= 100) steps = [50, 25, 10];
  else if (price >= 20) steps = [10, 5, 1];
  else if (price >= 5) steps = [1, 0.5];
  else steps = [0.5, 0.25];
  const lo = price * 0.88;
  const hi = price * 1.12;
  const seen = new Set<number>();
  const out: Seed[] = [];
  for (const step of steps) {
    const start = Math.ceil(lo / step) * step;
    for (let n = start; n <= hi + 1e-9; n += step) {
      const p = Math.round(n * 100) / 100;
      if (seen.has(p) || p <= 0) continue;
      seen.add(p);
      out.push({ price: p, source: "round", weight: 1 });
    }
  }
  return out;
}

function clusterSeeds(seeds: Seed[], tol: number): Array<{
  price: number;
  touches: number;
  sources: string[];
}> {
  const clusters: Array<{
    price: number;
    weight: number;
    touches: number;
    sources: Set<string>;
  }> = [];
  for (const seed of seeds) {
    if (!(seed.price > 0) || !Number.isFinite(seed.price)) continue;
    let hit = clusters.find((c) => Math.abs(c.price - seed.price) <= tol);
    if (!hit) {
      hit = {
        price: seed.price,
        weight: 0,
        touches: 0,
        sources: new Set(),
      };
      clusters.push(hit);
    }
    const w = Math.max(seed.weight, 1);
    hit.price = (hit.price * hit.weight + seed.price * w) / (hit.weight + w);
    hit.weight += w;
    hit.touches += 1;
    hit.sources.add(seed.source);
  }
  return clusters.map((c) => ({
    price: c.price,
    touches: c.touches,
    sources: [...c.sources],
  }));
}

function scoreCluster(sources: string[], touches: number): {
  score: number;
  strength: KeyLevel["strength"];
} {
  let score = touches;
  const set = new Set(sources);
  if (set.has("52w high") || set.has("52w low")) score += 3;
  if (set.has("VWAP") || set.has("EMA 200") || set.has("PDH") || set.has("PDL")) score += 2;
  if (set.has("gap fill") || set.has("PDC")) score += 1;
  if (set.has("EMA 50") || set.has("swing high") || set.has("swing low")) score += 1;
  if (set.size >= 3) score += 2;
  const strength: KeyLevel["strength"] =
    score >= 7 ? "Strong" : score >= 4 ? "Medium" : "Weak";
  return { score, strength };
}

export function findKeyLevels(
  bars: Bar[],
  extra: {
    price: number;
    atr: number | null;
    high52: number | null;
    low52: number | null;
    vwap: number | null;
    ema50: number;
    ema200: number;
    fib: TechnicalSnapshot["fib"];
    pivots: TechnicalSnapshot["pivots"];
    pdh?: number | null;
    pdl?: number | null;
    pdc?: number | null;
    gap?: TechnicalSnapshot["gap"];
  },
): { levels: KeyLevel[]; support: number; resistance: number } {
  const fallback = findLevels(bars);
  if (bars.length < 10 || !(extra.price > 0)) {
    return { levels: [], support: fallback.support, resistance: fallback.resistance };
  }

  const window = bars.length > 180 ? 5 : 4;
  const { highs, lows } = swingPoints(bars, window);
  const recent = bars.slice(-20);
  const rangeHigh = Math.max(...recent.map((b) => b.high));
  const rangeLow = Math.min(...recent.map((b) => b.low));
  const prior = bars.length >= 2 ? bars[bars.length - 2]! : bars[bars.length - 1]!;

  const seeds: Seed[] = [
    ...highs,
    ...lows,
    ...roundNumbers(extra.price),
    { price: rangeHigh, source: "20-bar high", weight: 2 },
    { price: rangeLow, source: "20-bar low", weight: 2 },
    { price: prior.high, source: "prior high", weight: 1.5 },
    { price: prior.low, source: "prior low", weight: 1.5 },
    { price: extra.ema50, source: "EMA 50", weight: 2 },
    { price: extra.ema200, source: "EMA 200", weight: 2 },
  ];
  if (extra.pdh) seeds.push({ price: extra.pdh, source: "PDH", weight: 3.5 });
  if (extra.pdl) seeds.push({ price: extra.pdl, source: "PDL", weight: 3.5 });
  if (extra.pdc) seeds.push({ price: extra.pdc, source: "PDC", weight: 2.5 });
  if (extra.gap && !extra.gap.filled) {
    seeds.push({
      price: extra.gap.kind === "up" ? extra.gap.from : extra.gap.to,
      source: "gap fill",
      weight: 3,
    });
  }
  if (extra.high52) seeds.push({ price: extra.high52, source: "52w high", weight: 4 });
  if (extra.low52) seeds.push({ price: extra.low52, source: "52w low", weight: 4 });
  if (extra.vwap) seeds.push({ price: extra.vwap, source: "VWAP", weight: 3 });
  if (extra.fib) {
    for (const l of extra.fib.levels) {
      if (l.ratio === 0.382 || l.ratio === 0.5 || l.ratio === 0.618) {
        seeds.push({ price: l.price, source: `Fib ${l.label}`, weight: 2 });
      }
    }
  }
  if (extra.pivots) {
    seeds.push(
      { price: extra.pivots.pp, source: "pivot", weight: 2 },
      { price: extra.pivots.r1, source: "pivot R1", weight: 1.5 },
      { price: extra.pivots.s1, source: "pivot S1", weight: 1.5 },
    );
  }

  const atr = extra.atr && extra.atr > 0 ? extra.atr : extra.price * 0.012;
  const tol = Math.max(atr * 0.35, extra.price * 0.0035);
  const clustered = clusterSeeds(seeds, tol);

  const bandLo = extra.price * 0.82;
  const bandHi = extra.price * 1.18;
  const levels: KeyLevel[] = clustered
    .filter((c) => c.price >= bandLo && c.price <= bandHi)
    .map((c) => {
      const { score, strength } = scoreCluster(c.sources, c.touches);
      return {
        price: c.price,
        kind: (c.price >= extra.price ? "resistance" : "support") as KeyLevel["kind"],
        score,
        touches: c.touches,
        strength,
        sources: c.sources,
      };
    })
    .sort((a, b) => b.price - a.price);

  const supports = levels.filter((l) => l.kind === "support");
  const resistances = levels.filter((l) => l.kind === "resistance");

  function pick(side: KeyLevel[], prefer: "high" | "low"): KeyLevel[] {
    if (side.length === 0) return [];
    const nearest =
      prefer === "high"
        ? side.reduce((a, b) => (a.price > b.price ? a : b))
        : side.reduce((a, b) => (a.price < b.price ? a : b));
    const rest = side
      .filter((l) => l !== nearest)
      .sort((a, b) => {
        const da = Math.abs(a.price - extra.price) / extra.price;
        const db = Math.abs(b.price - extra.price) / extra.price;
        return b.score / (1 + db * 30) - a.score / (1 + da * 30);
      });
    return [nearest, ...rest.slice(0, 3)];
  }

  const keep = [...pick(supports, "high"), ...pick(resistances, "low")].sort(
    (a, b) => b.price - a.price,
  );

  const nearestS = keep.filter((l) => l.kind === "support")[0]?.price
    ?? extra.low52
    ?? fallback.support;
  const nearestR =
    [...keep].reverse().find((l) => l.kind === "resistance")?.price
    ?? extra.high52
    ?? fallback.resistance;

  return { levels: keep, support: nearestS, resistance: nearestR };
}

export function snapshotFromBars(
  bars: Bar[],
  meta: {
    price: number;
    changePercent: number;
    volume: number | null;
    high52: number | null;
    low52: number | null;
  },
  opts: { sessionVwap?: boolean; interval?: string } = {},
): TechnicalSnapshot {
  const closes = bars.map((b) => b.close);
  const rsi = calculateRsi(closes);
  const macd = calculateMacd(closes);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const sma20 = smaLast(closes, 20);
  const bb = calculateBollinger(closes);
  const stoch = calculateStochastic(bars);
  const volumes = bars.map((b) => b.volume).filter((v) => v > 0);
  const avgVolume = smaLast(volumes, 20);
  const atr = calculateAtr(bars, 14);
  const vwap = calculateVwap(bars, Boolean(opts.sessionVwap));
  const fib = calculateFibonacci(bars);
  const pivots = calculatePivots(bars);
  const session = sessionLevels(bars, opts.interval ?? "D");
  const { levels: keyLevels, support, resistance } = findKeyLevels(bars, {
    price: meta.price,
    atr,
    high52: meta.high52,
    low52: meta.low52,
    vwap,
    ema50,
    ema200,
    fib,
    pivots,
    pdh: session.pdh,
    pdl: session.pdl,
    pdc: session.pdc,
    gap: session.gap,
  });

  let emaStack: TechnicalSnapshot["emaStack"] = "Mixed";
  if (ema9 > ema21 && ema21 > ema50) emaStack = "Bullish";
  else if (ema9 < ema21 && ema21 < ema50) emaStack = "Bearish";

  let trend: TechnicalSnapshot["trend"] = "Neutral";
  if (meta.price > ema50 && ema50 > ema21 && emaStack === "Bullish") trend = "Bullish";
  else if (meta.price < ema50 && emaStack === "Bearish") trend = "Bearish";
  else if (meta.price > ema50 && ema9 > ema21) trend = "Bullish";
  else if (meta.price < ema50 && ema9 < ema21) trend = "Bearish";

  const rsiZone: TechnicalSnapshot["rsiZone"] =
    rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : "neutral";

  return {
    price: meta.price,
    changePercent: meta.changePercent,
    rsi,
    rsiZone,
    macd: macd.macd,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    ema9,
    ema21,
    ema50,
    ema200,
    sma20,
    vwap,
    stochK: stoch.k,
    stochD: stoch.d,
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    bbWidth: bb.width,
    atr,
    support,
    resistance,
    keyLevels,
    pdh: session.pdh,
    pdl: session.pdl,
    pdc: session.pdc,
    gap: session.gap,
    volume: meta.volume,
    avgVolume,
    high52: meta.high52,
    low52: meta.low52,
    trend,
    emaStack,
    fib,
    pivots,
  };
}

export function computeBeta(
  stock: Bar[] | undefined,
  benchmark: Bar[] | undefined,
  minPoints = 40,
): number | null {
  if (!stock?.length || !benchmark?.length) return null;
  const sessionDay = (unix: number) =>
    new Date(unix * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const byDay = new Map(benchmark.map((b) => [sessionDay(b.time), b.close]));
  const paired: { s: number; b: number }[] = [];
  for (const bar of stock) {
    const bc = byDay.get(sessionDay(bar.time));
    if (typeof bc === "number") paired.push({ s: bar.close, b: bc });
  }
  if (paired.length < minPoints) return null;
  const rs: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < paired.length; i++) {
    const prevS = paired[i - 1]!.s;
    const prevB = paired[i - 1]!.b;
    if (prevS === 0 || prevB === 0) continue;
    rs.push((paired[i]!.s - prevS) / prevS);
    rb.push((paired[i]!.b - prevB) / prevB);
  }
  if (rs.length < minPoints - 1) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const ms = mean(rs);
  const mb = mean(rb);
  let cov = 0;
  let varb = 0;
  for (let i = 0; i < rs.length; i++) {
    const ds = rs[i]! - ms;
    const db = rb[i]! - mb;
    cov += ds * db;
    varb += db * db;
  }
  if (varb === 0) return null;
  return cov / varb;
}
