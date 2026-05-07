import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type Row = Record<string, unknown>;

export function parseFileBuffer(filename: string, buf: ArrayBuffer | Uint8Array): { sheets: Record<string, Row[]> } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const text = new TextDecoder().decode(buf as ArrayBuffer);
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    return { sheets: { Sheet1: result.data as Row[] } };
  }
  // xlsx / xlsm / xls / ods
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets: Record<string, Row[]> = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    sheets[name] = XLSX.utils.sheet_to_json<Row>(ws, { defval: null });
  }
  return { sheets };
}

const headerAliases: Record<string, string[]> = {
  name: ['name', 'material', 'material_name', 'ingredient', 'product'],
  cas: ['cas', 'cas no', 'cas#', 'cas number', 'primary_cas', 'primarycas'],
  supplier: ['supplier', 'vendor', 'source'],
  dilutionPct: ['dilution', 'dilution %', 'dilution_pct', 'strength', '%'],
  priceEurPerKg: ['price', 'price/kg', 'price eur/kg', 'price (eur/kg)', '€/kg', 'eur/kg', 'cost'],
  isNatural: ['natural', 'is_natural', 'naturel'],
  family: ['family', 'olfactory family', 'group'],
  chemicalGroup: ['chemical group', 'chemical_group', 'group'],
  descriptor1: ['descriptor 1', 'descriptor1', 'desc1', 'note 1'],
  descriptor2: ['descriptor 2', 'descriptor2', 'desc2', 'note 2'],
  personalDescription: ['personal description', 'personal_description', 'description', 'notes'],
  volatility: ['volatility', 'note', 'top/heart/base'],
  dosageBand: ['dosage', 'dosage_band', 'usage_level'],
  usage: ['usage', 'use'],
  density: ['density', 'density_g_per_ml', 'g/ml', 'sg'],
  stockG: ['stock', 'stock_g', 'inventory']
};

export function autoMap(headers: string[]): Record<string, string | null> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const mapping: Record<string, string | null> = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const aliasNorms = new Set(aliases.map(norm));
    const found = headers.find((h) => aliasNorms.has(norm(h)));
    mapping[field] = found ?? null;
  }
  return mapping;
}

export function parsePriceEurPerKg(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v);
  // "13 Euros/KG", "300 Euros/KG", "8 €/kg" → 13
  const m = s.match(/(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return Number(m[1].replace(',', '.'));
}

export function parseDilutionPct(v: unknown): number {
  if (v == null) return 100;
  if (typeof v === 'number') return v <= 1 ? v * 100 : v;
  const s = String(v).replace('%', '').trim();
  const n = Number(s);
  if (isNaN(n)) return 100;
  return n <= 1 ? n * 100 : n;
}
