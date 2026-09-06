import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeText } from "@/components/change-pill";
import { useWatchlist, type WatchlistSort } from "@/hooks/use-watchlist";
import { useQuotes } from "@/hooks/use-quotes";
import { WATCHLIST_SYNC } from "@/lib/market/universe";
import { formatPrice } from "@/lib/market/format";
import { cn } from "@/lib/utils";

function syncedAgo(ts: number | null): string {
  if (!ts) return "waiting";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 20) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function WatchlistPanel() {
  const {
    symbols,
    add,
    remove,
    clear,
    merge,
    replace,
    sort,
    setSort,
    sheetUrl,
    setSheetUrl,
    liveOn,
    setLiveOn,
    liveSyncing,
    liveError,
    lastSyncedAt,
    syncName,
    refetchLive,
  } = useWatchlist();
  const [draft, setDraft] = useState("");
  const [sheetDraft, setSheetDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
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

  async function saveAndLiveSync() {
    const url = (sheetDraft || sheetUrl).trim();
    if (url) setSheetUrl(url);
    setLiveOn(true);
    const res = await refetchLive();
    if (res.data?.symbols.length) {
      toast.success(`Live sync on · ${res.data.symbols.length} tickers`);
    } else if (res.error) {
      toast.error(res.error instanceof Error ? res.error.message : "Sync failed");
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
        <button
          type="button"
          onClick={() => setLiveOn(!liveOn)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            liveOn
              ? "bg-primary-soft text-primary"
              : "bg-bg text-subtle",
          )}
          title={liveOn ? "Live sync on — click to pause" : "Live sync paused — click to resume"}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              liveOn ? "bg-gain" : "bg-subtle",
              liveOn && liveSyncing ? "animate-pulse" : "",
            )}
          />
          {liveOn ? `LIVE · ${symbols.length}` : `PAUSED · ${symbols.length}`}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-subtle">
        {liveOn
          ? `${syncName} · every 4 hours${lastSyncedAt ? ` · last ${syncedAgo(lastSyncedAt)}` : ""}`
          : "Sync paused"}
      </p>
      {liveError && liveOn && sheetUrl ? (
        <p className="mb-2 text-[11px] text-danger">{liveError}</p>
      ) : null}
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
          ? Array.from({ length: 8 }).map((_, i) => (
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
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => setSheetOpen((v) => !v)}>
          <FileSpreadsheet className="size-3.5" />
          Sheets
        </Button>
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
      {sheetOpen ? (
        <div className="mt-2 rounded-md border border-border bg-bg p-2">
          <p className="mb-1.5 text-[11px] text-muted">
            Live sync pulls WatchlistSync every 4 hours. Paste a shared sheet link to follow the live file.
          </p>
          <Input
            value={sheetDraft || sheetUrl}
            onChange={(e) => setSheetDraft(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="h-8 text-[12px]"
          />
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button size="sm" disabled={liveSyncing} onClick={() => void saveAndLiveSync()}>
              {liveSyncing ? "Syncing…" : "Keep live"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                replace([...WATCHLIST_SYNC]);
                toast.success(`Loaded ${WATCHLIST_SYNC.length} tickers from WatchlistSync`);
              }}
            >
              Snapshot
            </Button>
          </div>
        </div>
      ) : null}
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