import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeText } from "@/components/change-pill";
import { useWatchlist, type WatchlistSort } from "@/hooks/use-watchlist";
import { useQuotes } from "@/hooks/use-quotes";
import { formatPrice } from "@/lib/market/format";
import { cn } from "@/lib/utils";

export function WatchlistPanel() {
  const { symbols, add, remove, clear, merge, sort, setSort } = useWatchlist();
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data, isLoading } = useQuotes(symbols, {
    enabled: symbols.length > 0,
  });

  const quotes = [...(data ?? [])];
  if (sort === "up") quotes.sort((a, b) => b.changePercent - a.changePercent);
  if (sort === "down") quotes.sort((a, b) => a.changePercent - b.changePercent);
  if (sort === "default") {
    quotes.sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));
  }

  function onAdd() {
    if (add(draft)) {
      toast.success(`${draft.toUpperCase()} added`);
      setDraft("");
    }
  }

  function exportList() {
    const blob = new Blob(
      [JSON.stringify({ watchlist: symbols, exportDate: new Date().toISOString(), version: "1.0" }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ridvon-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    try {
      const json = JSON.parse(await file.text()) as { watchlist?: string[] };
      if (!Array.isArray(json.watchlist)) throw new Error("Invalid file");
      merge(json.watchlist);
      toast.success(`Imported ${json.watchlist.length} symbols`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  const sorts: { id: WatchlistSort; label: string }[] = [
    { id: "default", label: "Default" },
    { id: "up", label: "% ↑" },
    { id: "down", label: "% ↓" },
  ];

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">Watchlist</CardTitle>
        <span className="rounded-sm bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          Local
        </span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-md bg-bg p-1">
        {sorts.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={cn(
              "rounded-sm py-1.5 text-[11px] font-semibold",
              sort === s.id
                ? "bg-surface text-primary shadow-sm"
                : "text-muted hover:text-fg",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <ul className="max-h-[420px] overflow-y-auto">
        {isLoading && symbols.length > 0 && quotes.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between py-3">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-8 w-16" />
              </li>
            ))
          : quotes.map((q) => (
              <li
                key={q.symbol}
                className="group relative flex items-center justify-between border-b border-border/70 py-3 last:border-0"
              >
                <button
                  type="button"
                  className="text-left font-semibold hover:text-primary"
                  onClick={() =>
                    void navigate({
                      to: "/analysis",
                      search: { ticker: q.symbol, tab: "analyze" },
                    })
                  }
                >
                  {q.symbol}
                </button>
                <div className="pr-6 text-right">
                  <div className="text-sm font-semibold tabular">{formatPrice(q.price)}</div>
                  <ChangeText value={q.changePercent} className="text-xs" />
                </div>
                <button
                  type="button"
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                  onClick={() => remove(q.symbol)}
                  aria-label={`Remove ${q.symbol}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
        {symbols.length === 0 && (
          <li className="py-6 text-center text-sm text-subtle">No stocks added yet</li>
        )}
      </ul>

      <div className="mt-3 flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          placeholder="Add ticker…"
          maxLength={10}
          className="h-9 font-semibold uppercase"
        />
        <Button size="icon" className="h-9 w-9 shrink-0" onClick={onAdd} aria-label="Add">
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Button variant="secondary" size="sm" onClick={exportList}>
          <Download className="size-3.5" /> Export
        </Button>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" /> Import
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="text-danger hover:border-danger/40"
          onClick={() => {
            if (symbols.length && confirm("Clear the entire watchlist?")) clear();
          }}
        >
          <Trash2 className="size-3.5" /> Clear
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
    </Card>
  );
}
