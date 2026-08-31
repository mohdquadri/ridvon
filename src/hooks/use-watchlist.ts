import { useCallback, useEffect, useState } from "react";
import { DEFAULT_WATCHLIST } from "@/lib/market/universe";

const KEY = "ridvon_watchlist";
const SORT_KEY = "ridvon_watchlist_sort";

export type WatchlistSort = "default" | "up" | "down";

function readList(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_WATCHLIST;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_WATCHLIST;
    return parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toUpperCase().replace(/[^A-Z.]/g, ""))
      .filter(Boolean);
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_WATCHLIST);
  const [sort, setSortState] = useState<WatchlistSort>("default");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSymbols(readList());
    const s = localStorage.getItem(SORT_KEY);
    if (s === "up" || s === "down" || s === "default") setSortState(s);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(KEY, JSON.stringify(symbols));
  }, [symbols, ready]);

  const add = useCallback((raw: string) => {
    const symbol = raw.toUpperCase().replace(/[^A-Z.]/g, "");
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
        const symbol = s.toUpperCase().replace(/[^A-Z.]/g, "");
        if (symbol && !next.includes(symbol)) next.push(symbol);
      }
      return next;
    });
  }, []);

  const setSort = useCallback((value: WatchlistSort) => {
    setSortState(value);
    localStorage.setItem(SORT_KEY, value);
  }, []);

  return { symbols, add, remove, clear, merge, sort, setSort, ready };
}
