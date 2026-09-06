import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_WATCHLIST, WATCHLIST_SYNC } from "@/lib/market/universe";
import { syncWatchlistSheet } from "@/lib/market/api";

const KEY = "ridvon_watchlist";
const SORT_KEY = "ridvon_watchlist_sort";
const SHEET_KEY = "ridvon_watchlist_sheet";
const LIVE_KEY = "ridvon_watchlist_live";

export type WatchlistSort = "default" | "up" | "down";

function cleanSymbol(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9.]/g, "");
}

function looksLikeOldDefault(list: string[]): boolean {
  if (list.length !== DEFAULT_WATCHLIST.length) return false;
  return DEFAULT_WATCHLIST.every((s, i) => list[i] === s);
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s === b[i]);
}

function readList(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...WATCHLIST_SYNC];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...WATCHLIST_SYNC];
    const list = parsed
      .filter((s): s is string => typeof s === "string")
      .map(cleanSymbol)
      .filter(Boolean);
    if (list.length === 0 || looksLikeOldDefault(list)) return [...WATCHLIST_SYNC];
    return list;
  } catch {
    return [...WATCHLIST_SYNC];
  }
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([...WATCHLIST_SYNC]);
  const [sort, setSortState] = useState<WatchlistSort>("default");
  const [sheetUrl, setSheetUrlState] = useState("");
  const [liveOn, setLiveOnState] = useState(true);
  const [ready, setReady] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncName, setSyncName] = useState("WatchlistSync");
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  useEffect(() => {
    setSymbols(readList());
    const s = localStorage.getItem(SORT_KEY);
    if (s === "up" || s === "down" || s === "default") setSortState(s);
    setSheetUrlState(localStorage.getItem(SHEET_KEY) ?? "");
    const live = localStorage.getItem(LIVE_KEY);
    setLiveOnState(live !== "off");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(KEY, JSON.stringify(symbols));
  }, [symbols, ready]);

  const live = useQuery({
    queryKey: ["watchlist-sheet", sheetUrl],
    queryFn: () => syncWatchlistSheet({ data: { url: sheetUrl } }),
    enabled: ready && liveOn && Boolean(sheetUrl),
    refetchInterval: 4 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 60 * 1000,
    retry: 0,
  });

  useEffect(() => {
    const next = live.data?.symbols;
    if (!next?.length) return;
    setSymbols((prev) => (sameList(prev, next) ? prev : next));
    setLastSyncedAt(Date.now());
    if (live.data?.name) setSyncName(live.data.name);
    setSyncWarning(live.data?.warning ?? null);
    if (live.data?.url && live.data.url !== sheetUrl) {
      setSheetUrlState(live.data.url);
      localStorage.setItem(SHEET_KEY, live.data.url);
    }
  }, [live.data, sheetUrl]);

  const add = useCallback((raw: string) => {
    const symbol = cleanSymbol(raw);
    if (!symbol) return false;
    setSymbols((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
    return true;
  }, []);

  const remove = useCallback((symbol: string) => {
    setSymbols((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const clear = useCallback(() => setSymbols([]), []);

  const merge = useCallback((incoming: string[]) => {
    setSymbols((prev) => {
      const next = [...prev];
      for (const s of incoming) {
        const symbol = cleanSymbol(s);
        if (symbol && !next.includes(symbol)) next.push(symbol);
      }
      return next;
    });
  }, []);

  const replace = useCallback((incoming: string[]) => {
    const next = [...new Set(incoming.map(cleanSymbol).filter(Boolean))];
    if (next.length === 0) return;
    setSymbols(next);
  }, []);

  const setSort = useCallback((value: WatchlistSort) => {
    setSortState(value);
    localStorage.setItem(SORT_KEY, value);
  }, []);

  const setSheetUrl = useCallback((url: string) => {
    setSheetUrlState(url);
    if (url) localStorage.setItem(SHEET_KEY, url);
    else localStorage.removeItem(SHEET_KEY);
  }, []);

  const setLiveOn = useCallback((on: boolean) => {
    setLiveOnState(on);
    localStorage.setItem(LIVE_KEY, on ? "on" : "off");
  }, []);

  return {
    symbols,
    add,
    remove,
    clear,
    merge,
    replace,
    sort,
    setSort,
    ready,
    sheetUrl,
    setSheetUrl,
    liveOn,
    setLiveOn,
    liveSyncing: live.isFetching,
    liveError: sheetUrl && live.error instanceof Error
      ? live.error.message
      : sheetUrl && live.error
        ? "Sync failed"
        : null,
    lastSyncedAt,
    syncName,
    syncWarning,
    refetchLive: live.refetch,
  };
}