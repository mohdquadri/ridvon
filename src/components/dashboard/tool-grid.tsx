import { Link } from "@tanstack/react-router";
import { Activity, LineChart, Radar } from "lucide-react";

const TOOLS = [
  {
    to: "/analysis",
    search: { ticker: "", tab: "scanner" as const },
    icon: Radar,
    title: "Catalyst Scanner",
    desc: "Find stocks with upcoming catalysts and news events",
  },
  {
    to: "/analysis",
    search: { ticker: "", tab: "analyze" as const },
    icon: LineChart,
    title: "Stock Analysis",
    desc: "Live quote, levels, news, and Grok-powered fundamentals",
  },
  {
    to: "/analysis",
    search: { ticker: "", tab: "technical" as const },
    icon: Activity,
    title: "Technical Signals",
    desc: "Trend, support and resistance, RSI, MACD, trade setups",
  },
] as const;

export function ToolGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {TOOLS.map((t) => (
        <Link
          key={t.title}
          to={t.to}
          search={t.search}
          className="group rounded-lg border border-border bg-surface p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-sm"
        >
          <t.icon className="mb-3 size-6 text-primary" />
          <div className="text-[15px] font-semibold text-fg">{t.title}</div>
          <p className="mt-1 text-[13px] leading-snug text-muted">{t.desc}</p>
        </Link>
      ))}
    </div>
  );
}
