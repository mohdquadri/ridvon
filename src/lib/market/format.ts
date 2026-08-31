export function formatPrice(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) {
    return (
      "$" +
      n.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    );
  }
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatVolume(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export function formatMetricNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return formatCompact(n);
}

export function formatShares(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return formatVolume(n);
}

export function formatMarginPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return `${n.toFixed(2)}%`;
}

export function formatRatio(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return n.toFixed(digits);
}

export function formatIpoDate(unixSec: number | null | undefined): string {
  if (unixSec === null || unixSec === undefined || !Number.isFinite(unixSec)) return "N/A";
  try {
    return new Date(unixSec * 1000).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
  } catch {
    return "N/A";
  }
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T16:00:00-04:00`);
  if (!Number.isFinite(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

export function timeAgo(unixSec: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function marketSession(now = new Date()): {
  open: boolean;
  label: string;
} {
  const ny = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const day = ny.getDay();
  const minutes = ny.getHours() * 60 + ny.getMinutes();
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  if (day === 0 || day === 6) return { open: false, label: "Weekend" };
  if (minutes >= open && minutes < close) return { open: true, label: "Markets Open" };
  if (minutes < open) return { open: false, label: "Pre-Market" };
  return { open: false, label: "After Hours" };
}
