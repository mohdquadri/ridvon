import { useQuery } from "@tanstack/react-query";
import { getQuotes } from "@/lib/market/api";
import { yahooSymbol } from "@/lib/market/universe";

export function useQuotes(
  symbols: readonly string[],
  opts?: { refetchInterval?: number; staleTime?: number; enabled?: boolean },
) {
  const list = symbols.map(yahooSymbol).filter(Boolean);
  const key = [...list].sort().join(",");
  return useQuery({
    queryKey: ["quotes", key],
    queryFn: () => getQuotes({ data: { symbols: list } }),
    enabled: (opts?.enabled ?? true) && list.length > 0,
    refetchInterval: opts?.refetchInterval ?? 60_000,
    staleTime: opts?.staleTime ?? 20_000,
  });
}
