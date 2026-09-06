import { createServerFn } from "@tanstack/react-start";
import type {
  GrokFundamental,
  GrokTechnical,
  GrokTradeCall,
  HorizonCall,
  TechnicalSnapshot,
} from "./types";

const MODEL = "grok-4.5";

async function chat(messages: { role: "system" | "user"; content: string }[], maxTokens = 1400) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI is not available in this environment" };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    return { ok: false as const, error: `xAI API error ${res.status}` };
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text) return { ok: false as const, error: "Empty AI response" };
  return { ok: true as const, text };
}

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asCall(v: unknown): HorizonCall {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const str = (k: string, fallback: string) =>
    typeof o[k] === "string" && o[k].trim() ? (o[k] as string).trim() : fallback;
  return {
    action: str("action", "Wait"),
    take: str("take", ""),
    entry: str("entry", "—"),
    stop: str("stop", "—"),
    target: str("target", "—"),
  };
}

export const analyzeFundamentalsAi = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as {
      symbol?: unknown;
      name?: unknown;
      price?: unknown;
      changePercent?: unknown;
      high52?: unknown;
      low52?: unknown;
      headlines?: unknown;
      metrics?: unknown;
      levels?: unknown;
    };
    if (typeof o.symbol !== "string") throw new Error("symbol required");
    const headlines = Array.isArray(o.headlines)
      ? o.headlines.filter((h): h is string => typeof h === "string").slice(0, 8)
      : [];
    const metrics = Array.isArray(o.metrics)
      ? o.metrics.filter((h): h is string => typeof h === "string").slice(0, 40)
      : [];
    const levels = Array.isArray(o.levels)
      ? o.levels.filter((h): h is string => typeof h === "string").slice(0, 16)
      : [];
    return {
      symbol: o.symbol.toUpperCase(),
      name: typeof o.name === "string" ? o.name : o.symbol,
      price: typeof o.price === "number" ? o.price : 0,
      changePercent: typeof o.changePercent === "number" ? o.changePercent : 0,
      high52: typeof o.high52 === "number" ? o.high52 : null,
      low52: typeof o.low52 === "number" ? o.low52 : null,
      headlines,
      metrics,
      levels,
    };
  })
  .handler(async ({ data }) => {
    const prompt = `Analyze ${data.name} (${data.symbol}) as a buy-side equity analyst making a trade call.

Live quote:
- Price: $${data.price.toFixed(2)} (${data.changePercent >= 0 ? "+" : ""}${data.changePercent.toFixed(2)}%)
- 52-week high: ${data.high52 ?? "n/a"}
- 52-week low: ${data.low52 ?? "n/a"}

Key fundamentals:
${data.metrics.map((m) => `- ${m}`).join("\n") || "(none)"}

Chart levels (use these dollar numbers, do not invent round numbers):
${data.levels.map((m) => `- ${m}`).join("\n") || "(none)"}

Recent headlines:
${data.headlines.map((h, i) => `${i + 1}. ${h}`).join("\n") || "(none)"}

Return ONLY JSON with this shape:
{
  "valuation": { "metric": "short label e.g. Premium / Fair / Discount", "take": "1-2 sentences" },
  "growth": { "metric": "short label", "take": "1-2 sentences" },
  "risks": { "metric": "short label", "take": "1-2 sentences" },
  "sentiment": "2-3 sentences on news tone and near-term tape",
  "outlook": "2 sentences, actionable",
  "shortTerm": { "action": "Buy|Wait|Trim|Avoid", "take": "1 sentence for next 1-10 sessions", "entry": "$x-$y", "stop": "$z", "target": "$w" },
  "swing": { "action": "Buy|Wait|Trim|Avoid", "take": "1 sentence for 2-8 weeks", "entry": "$x-$y", "stop": "$z", "target": "$w" },
  "longTerm": { "action": "Buy|Wait|Trim|Avoid", "take": "1 sentence for 6-18 months", "entry": "$x-$y", "stop": "$z", "target": "$w" }
}

Rules:
- action must be exactly Buy, Wait, Trim, or Avoid.
- Levels must be dollar prices from the chart levels or nearby. Cite support as entry, a level below as stop/invalidation, resistance as target.
- Short-term = days to 2 weeks. Swing = weeks to ~2 months. Long-term = 6-18 month investor.
- Be decisive. No disclaimer dump. No markdown.`;

    const result = await chat(
      [
        {
          role: "system",
          content:
            "You are a buy-side equity analyst making a clear buy/wait call by horizon. Output valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      1600,
    );
    if (!result.ok) return result;
    const parsed = extractJson(result.text) as GrokFundamental | null;
    if (!parsed?.valuation || !parsed.growth || !parsed.risks) {
      return { ok: false as const, error: "Could not parse AI analysis" };
    }
    parsed.shortTerm = asCall(parsed.shortTerm);
    parsed.swing = asCall(parsed.swing);
    parsed.longTerm = asCall(parsed.longTerm);
    return { ok: true as const, analysis: parsed };
  });

export const analyzeTechnicalAi = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as {
      symbol?: unknown;
      style?: unknown;
      timeframe?: unknown;
      snapshot?: unknown;
    };
    if (typeof o.symbol !== "string") throw new Error("symbol required");
    const s = o.snapshot as TechnicalSnapshot | undefined;
    if (!s || typeof s !== "object" || typeof s.price !== "number") {
      throw new Error("snapshot required");
    }
    return {
      symbol: o.symbol.toUpperCase(),
      style: typeof o.style === "string" ? o.style : "swingTrading",
      timeframe: typeof o.timeframe === "string" ? o.timeframe : "D",
      snapshot: s,
    };
  })
  .handler(async ({ data }) => {
    const t = data.snapshot;
    const styleLabel =
      data.style === "dayTrading"
        ? "Day Trading"
        : data.style === "position"
          ? "Position"
          : "Swing Trading";
    const tfLabel: Record<string, string> = {
      "5": "5-Minute",
      "15": "15-Minute",
      "60": "1-Hour",
      D: "Daily",
      W: "Weekly",
    };

    const prompt = `Professional technical read for ${data.symbol}.
Timeframe: ${tfLabel[data.timeframe] ?? data.timeframe}
Style: ${styleLabel}

LIVE INDICATORS:
- Price: $${t.price.toFixed(2)} (${t.changePercent >= 0 ? "+" : ""}${t.changePercent.toFixed(2)}%)
- RSI(14): ${t.rsi.toFixed(1)} (${t.rsiZone ?? "n/a"})
- Stoch %K/%D: ${t.stochK != null ? t.stochK.toFixed(1) : "n/a"} / ${t.stochD != null ? t.stochD.toFixed(1) : "n/a"}
- MACD ${t.macd.toFixed(3)} / signal ${t.macdSignal.toFixed(3)} / hist ${t.macdHistogram.toFixed(4)}
- EMA9 ${t.ema9.toFixed(2)} / EMA21 ${t.ema21.toFixed(2)} / EMA50 ${t.ema50.toFixed(2)} / EMA200 ${t.ema200.toFixed(2)}
- SMA20 ${t.sma20 != null ? t.sma20.toFixed(2) : "n/a"} / VWAP ${t.vwap != null ? t.vwap.toFixed(2) : "n/a"}
- Bollinger ${t.bbLower != null ? t.bbLower.toFixed(2) : "n/a"} – ${t.bbUpper != null ? t.bbUpper.toFixed(2) : "n/a"} (width ${t.bbWidth != null ? (t.bbWidth * 100).toFixed(1) + "%" : "n/a"})
- Support ${t.support.toFixed(2)} / Resistance ${t.resistance.toFixed(2)}
- Key levels: ${(t.keyLevels ?? []).map((l) => `${l.kind === "resistance" ? "R" : "S"} ${l.price.toFixed(2)} (${l.strength}, ${l.sources.slice(0, 3).join("+")})`).join("; ") || "n/a"}
- ATR ${t.atr !== null ? t.atr.toFixed(2) : "n/a"}
- Pivots ${t.pivots ? `S1 ${t.pivots.s1.toFixed(2)} / PP ${t.pivots.pp.toFixed(2)} / R1 ${t.pivots.r1.toFixed(2)}` : "n/a"}
- PDH ${t.pdh?.toFixed(2) ?? "n/a"} / PDC ${t.pdc?.toFixed(2) ?? "n/a"} / PDL ${t.pdl?.toFixed(2) ?? "n/a"}
- Gap ${t.gap ? `${t.gap.kind} ${t.gap.from.toFixed(2)}–${t.gap.to.toFixed(2)} ${t.gap.filled ? "filled" : "unfilled"}` : "none"}
- Fib swing ${t.fib ? `${t.fib.low.toFixed(2)} – ${t.fib.high.toFixed(2)} (${t.fib.up ? "up" : "down"}) levels ${t.fib.levels.map((l) => l.label + " " + l.price.toFixed(2)).join(", ")}` : "n/a"}
- 52w ${t.low52 ?? "n/a"} – ${t.high52 ?? "n/a"}
- EMA stack: ${t.emaStack ?? "n/a"} / trend: ${t.trend}

Return ONLY JSON:
{
  "trend": "2-3 sentences",
  "volatility": "2-3 sentences",
  "levels": "2-3 sentences citing nearest key support/resistance, PDH/PDL, unfilled gaps, Fibonacci, and pivots with actual prices",
  "bullish": "1-2 sentences with a target",
  "bearish": "1-2 sentences with a target",
  "neutral": "1-2 sentences",
  "risk": "2 sentences, stop and invalidation",
  "entry": "$x",
  "stop": "$y",
  "target": "$z",
  "bias": "BULLISH | BEARISH | NEUTRAL",
  "confidence": "e.g. 62%",
  "note": "one sentence"
}`;

    const result = await chat(
      [
        {
          role: "system",
          content: "You are a professional quantitative trader. JSON only. Use the supplied numbers.",
        },
        { role: "user", content: prompt },
      ],
      1400,
    );
    if (!result.ok) return result;
    const parsed = extractJson(result.text) as GrokTechnical | null;
    if (!parsed?.trend || !parsed.bias) {
      return { ok: false as const, error: "Could not parse AI analysis" };
    }
    return { ok: true as const, analysis: parsed };
  });

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export const analyzeTradeAi = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("invalid");
    const o = input as {
      symbol?: unknown;
      name?: unknown;
      snapshot?: unknown;
      rvol?: unknown;
      floatShares?: unknown;
      shortFloatPct?: unknown;
      setup?: unknown;
      score?: unknown;
      market?: unknown;
      headlines?: unknown;
    };
    if (typeof o.symbol !== "string") throw new Error("symbol required");
    const s = o.snapshot as TechnicalSnapshot | undefined;
    if (!s || typeof s !== "object" || typeof s.price !== "number") {
      throw new Error("snapshot required");
    }
    const headlines = Array.isArray(o.headlines)
      ? o.headlines.filter((h): h is string => typeof h === "string").slice(0, 6)
      : [];
    const market = Array.isArray(o.market)
      ? o.market.filter((h): h is string => typeof h === "string").slice(0, 8)
      : [];
    return {
      symbol: o.symbol.toUpperCase(),
      name: typeof o.name === "string" ? o.name : o.symbol,
      snapshot: s,
      rvol: typeof o.rvol === "number" ? o.rvol : null,
      floatShares: typeof o.floatShares === "number" ? o.floatShares : null,
      shortFloatPct: typeof o.shortFloatPct === "number" ? o.shortFloatPct : null,
      setup: typeof o.setup === "string" ? o.setup : "Chop",
      score: typeof o.score === "number" ? o.score : 50,
      market,
      headlines,
    };
  })
  .handler(async ({ data }) => {
    const t = data.snapshot;
    const prompt = `Decide if ${data.name} (${data.symbol}) is worth TRADING RIGHT NOW. Not a research memo — a go / no-go.

LIVE:
- Price $${t.price.toFixed(2)} (${t.changePercent >= 0 ? "+" : ""}${t.changePercent.toFixed(2)}%)
- RVOL ${data.rvol != null ? data.rvol.toFixed(2) + "x" : "n/a"}
- Setup ${data.setup} · tape score ${data.score}
- RSI ${t.rsi.toFixed(1)} (${t.rsiZone}) · MACD hist ${t.macdHistogram.toFixed(4)}
- EMA9 ${t.ema9.toFixed(2)} / EMA21 ${t.ema21.toFixed(2)} / EMA50 ${t.ema50.toFixed(2)} / EMA200 ${t.ema200.toFixed(2)}
- VWAP ${t.vwap != null ? t.vwap.toFixed(2) : "n/a"} · ATR ${t.atr != null ? t.atr.toFixed(2) : "n/a"}
- Support ${t.support.toFixed(2)} / Resistance ${t.resistance.toFixed(2)}
- PDH ${t.pdh?.toFixed(2) ?? "n/a"} / PDL ${t.pdl?.toFixed(2) ?? "n/a"}
- Gap ${t.gap ? `${t.gap.kind} ${t.gap.from.toFixed(2)}–${t.gap.to.toFixed(2)} ${t.gap.filled ? "filled" : "open"}` : "none"}
- Trend ${t.trend} · EMA stack ${t.emaStack}
- Float ${data.floatShares != null ? data.floatShares.toFixed(0) : "n/a"} · Short float ${data.shortFloatPct != null ? data.shortFloatPct.toFixed(2) + "%" : "n/a"}
- Key levels: ${(t.keyLevels ?? []).slice(0, 6).map((l) => `${l.kind === "resistance" ? "R" : "S"} ${l.price.toFixed(2)}`).join("; ") || "n/a"}

MARKET:
${data.market.join("\n") || "(none)"}

HEADLINES:
${data.headlines.map((h, i) => `${i + 1}. ${h}`).join("\n") || "(none)"}

Return ONLY JSON:
{
  "tradeable": true,
  "bias": "BULLISH",
  "setup": "Breakout",
  "confidence": 87,
  "entry": 12.4,
  "stop": 11.8,
  "target": 13.9,
  "target2": 14.6,
  "rr": 3.4,
  "confirm": "Volume > 2x average + hold above VWAP",
  "avoid": "QQQ reverses or price loses 11.80",
  "note": "one sentence"
}

Rules:
- tradeable true only if a defined long or short has R:R >= 1.8 and market is not fighting it.
- bias is BULLISH, BEARISH, or NEUTRAL. Numbers are dollars from the levels above.
- rr is reward/risk (target-entry)/(entry-stop) as a positive number.
- If not a trade, tradeable=false, still fill levels for the wait.
- No disclaimer dump.`;

    const result = await chat(
      [
        {
          role: "system",
          content:
            "You are a tape reader. Answer whether this name is worth trading right now. JSON only. Use supplied prices.",
        },
        { role: "user", content: prompt },
      ],
      900,
    );
    if (!result.ok) return result;
    const raw = extractJson(result.text) as Record<string, unknown> | null;
    if (!raw) return { ok: false as const, error: "Could not parse trade call" };
    const biasRaw = String(raw.bias ?? "NEUTRAL").toUpperCase();
    const bias: GrokTradeCall["bias"] =
      biasRaw.includes("BULL") ? "BULLISH" : biasRaw.includes("BEAR") ? "BEARISH" : "NEUTRAL";
    const call: GrokTradeCall = {
      tradeable: Boolean(raw.tradeable) && bias !== "NEUTRAL",
      bias,
      setup: typeof raw.setup === "string" && raw.setup.trim() ? raw.setup.trim() : data.setup,
      confidence: Math.max(1, Math.min(99, Math.round(num(raw.confidence, data.score)))),
      entry: num(raw.entry, t.support),
      stop: num(raw.stop, t.support * 0.98),
      target: num(raw.target, t.resistance),
      target2: raw.target2 == null ? null : num(raw.target2, t.resistance),
      rr: Math.abs(num(raw.rr, 2)),
      confirm: typeof raw.confirm === "string" ? raw.confirm : "Hold above VWAP with RVOL > 1.5x",
      avoid: typeof raw.avoid === "string" ? raw.avoid : `Price loses ${t.support.toFixed(2)}`,
      note: typeof raw.note === "string" ? raw.note : "",
    };
    return { ok: true as const, analysis: call };
  });
