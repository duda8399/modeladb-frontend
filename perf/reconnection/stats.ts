const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12,
  2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export type Dispersion = {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  p50: number;
  ci95Low: number;
  ci95High: number;
};

export const round = (v: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export function dispersion(raw: (number | null | undefined)[]): Dispersion {
  const values = raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const n = values.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN, min: NaN, max: NaN, p50: NaN, ci95Low: NaN, ci95High: NaN };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const t = n > 1 ? (T_975[n - 2] ?? 1.96) : 0;
  const half = n > 1 ? (t * sd) / Math.sqrt(n) : 0;
  return {
    n,
    mean: round(mean, 4),
    sd: round(sd, 4),
    min: round(sorted[0], 4),
    max: round(sorted[n - 1], 4),
    p50: round(sorted[Math.max(0, Math.ceil(n / 2) - 1)], 4),
    ci95Low: round(mean - half, 4),
    ci95High: round(mean + half, 4),
  };
}
