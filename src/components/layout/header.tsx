import { useState, type FormEvent } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Header() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function submit(e: FormEvent) {
    e.preventDefault();
    const ticker = q.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (!ticker) return;
    setQ("");
    void navigate({ to: "/analysis", search: { ticker, tab: "analyze" } });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <span className="text-[22px] font-bold tracking-tight text-primary">Ridvon</span>
          <span className="rounded-sm border border-primary/30 bg-primary-soft px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">Stock trading</span>
        </Link>
        <form onSubmit={submit} className="flex w-full justify-center md:flex-1">
          <input value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder="Quick search: AAPL, TSLA, NVDA…" aria-label="Quick search ticker" autoComplete="off" className="h-11 w-full max-w-[420px] rounded-md border border-border bg-surface px-4 text-[15px] font-medium uppercase tracking-wide outline-none transition-shadow placeholder:normal-case placeholder:tracking-normal placeholder:text-subtle focus:border-primary focus:shadow-[0_0_0_3px_rgb(0_166_126_/_0.12)]" />
        </form>
        <nav className="flex shrink-0 items-center gap-6">
          <NavLink to="/" active={pathname === "/"}>Dashboard</NavLink>
          <Link to="/analysis" search={{ ticker: "", tab: "analyze" }} className={cn("text-sm font-medium no-underline transition-colors", pathname.startsWith("/analysis") ? "text-primary" : "text-muted hover:text-fg")}>Analysis</Link>
          <NavLink to="/charts" active={pathname.startsWith("/charts")}>Charts</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ to, active, children }: { to: "/" | "/charts"; active: boolean; children: string }) {
  return (
    <Link to={to} className={cn("text-sm font-medium no-underline transition-colors", active ? "text-primary" : "text-muted hover:text-fg")}>
      {children}
    </Link>
  );
}
