// Instagram-style compact number formatting for likes / comments / shares / views.
// Examples: 842 -> "842", 9,431 -> "9,431", 75,300 -> "75.3K", 1,240,000 -> "1.2M",
// 75,100,000 -> "75.1M", 2,300,000,000 -> "2.3B"
const trim = (s: string) => s.replace(/\.0$/, "");

export const formatMetric = (value: number | string | null | undefined): string => {
  const n = typeof value === "string" ? Number(String(value).replace(/[^\d.-]/g, "")) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs < 10_000) return Math.round(n).toLocaleString();
  if (abs < 1_000_000) return trim((n / 1_000).toFixed(1)) + "K";
  if (abs < 1_000_000_000) return trim((n / 1_000_000).toFixed(1)) + "M";
  if (abs < 1_000_000_000_000) return trim((n / 1_000_000_000).toFixed(1)) + "B";
  return trim((n / 1_000_000_000_000).toFixed(1)) + "T";
};

export default formatMetric;
