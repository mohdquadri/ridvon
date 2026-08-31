import { createServerFn } from "@tanstack/react-start";
import type { GrokFundamental, GrokTechnical, TechnicalSnapshot } from "./types";

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
    };
    if (typeof o.symbol !== "string") throw new Error("symbol required");
    const headlines = Array.isArray(o.headlines)
      ? o.headlines.filter((h): h is string => typeof h === "string").slice(0, 8)
      : [];
    const metrics = Array.isArray(o.metrics)
      ? o.metrics.filter((h): h is string => typeof h === "string").slice(0, 32)
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
    };
  })
  .handler(async ({ data }) => {
    const prompt = `Analyze ${data.name} (${data.symbol}) as a concise equity analyst.

Live quote:
- Price: $${data.price.toFixed(2)} (${data.changePercent >= 0 ? "+" : ""}${data.changePercent.toFixed(2)}%)
- 52-week high: ${data.high52 ?? "n/a"}
- 52-week low: ${data.low52 ?? "n/a"}

Key fundamentals:
${data.metrics.map((m) => `- ${m}`).join("\n") || "(none)"}

Recent headlines:
${data.headlines.map((h, i) => `${i + 1}. ${h}`).join("\n") || "(none)"}

Return ONLY JSON with this shape:
{
  "valuation": { "metric": "short label e.g. Premium / Fair / Discount", "take": "1-2 sentences" },
  "growth": { "metric": "short label", "take": "1-2 sentences" },
  "risks": { "metric": "short label", "take": "1-2 sentences" },
  "sentiment": "2-3 sentences on news tone and near-term tape",
  "outlook": "2 sentences, actionable, no disclaimer dump"
}

Use your knowledge of the company plus the live quote. Be specific. No markdown.`;

    const result = await chat(
      [
        {
          role: "system",
          content:
            "You are a buy-side equity analyst. Output valid JSON only. No markdown fences unless needed.",
        },
        { role: "user", content: prompt },
      ],
      1100,
    );
    if (!result.ok) return result;
    const parsed = extractJson(result.text) as GrokFundamental | null;
    if (!parsed?.valuation || !parsed.growth || !parsed.risks) {
      return { ok: false as const, error: "Could not parse AI analysis" };
    }
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
