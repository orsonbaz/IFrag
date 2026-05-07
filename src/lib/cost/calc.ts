import Decimal from 'decimal.js';

/**
 * priceMinor is per gram in minor currency units (e.g. EUR cents). E.g. €13/kg → 1.3 cents/g → 1.3.
 * partsPer1000 is the component's share of a 1000-part formula.
 * Returns cost in MINOR units for a given batch size in grams.
 */
export function componentCostMinor(
  partsPer1000: number,
  priceMinorPerGram: number | null | undefined,
  batchG: number
): Decimal {
  if (priceMinorPerGram == null) return new Decimal(0);
  return new Decimal(partsPer1000)
    .div(1000)
    .times(batchG)
    .times(priceMinorPerGram);
}

export function totalCostMinor(
  components: Array<{ partsPer1000: number; priceMinorPerGram: number | null | undefined }>,
  batchG: number
): Decimal {
  return components.reduce(
    (acc, c) => acc.plus(componentCostMinor(c.partsPer1000, c.priceMinorPerGram, batchG)),
    new Decimal(0)
  );
}
