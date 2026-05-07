export function formatPp1000(v: number): string {
  if (v == null || isNaN(v)) return '—';
  if (v === 0) return '0';
  if (v < 0.01) return v.toExponential(1);
  if (v < 10) return v.toFixed(2);
  if (v < 100) return v.toFixed(1);
  return Math.round(v).toString();
}

export function formatPct(v: number): string {
  if (v == null || isNaN(v)) return '—';
  if (v === 0) return '0%';
  if (v < 0.001) return v.toExponential(1) + '%';
  if (v < 0.1) return v.toFixed(3) + '%';
  if (v < 1) return v.toFixed(2) + '%';
  if (v < 10) return v.toFixed(1) + '%';
  return Math.round(v) + '%';
}

const currencySymbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', JPY: '¥' };

export function formatMoney(minor: number | null | undefined, currency: string = 'EUR'): string {
  if (minor == null) return '—';
  const sym = currencySymbols[currency] ?? currency + ' ';
  const major = minor / 100;
  return `${sym}${major.toFixed(2)}`;
}

export function formatPp1000ToPct(pp: number): number {
  return pp / 10;
}

export function pctToPp1000(pct: number): number {
  return pct * 10;
}

export function ppToGrams(pp: number, batchG: number): number {
  return (pp / 1000) * batchG;
}

export function gramsToPp(grams: number, batchG: number): number {
  if (batchG === 0) return 0;
  return (grams / batchG) * 1000;
}
