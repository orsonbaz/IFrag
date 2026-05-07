import Decimal from 'decimal.js';

/**
 * priceMinorPerKg is the price per kg in minor currency units (e.g. EUR cents).
 * €13/kg → 1300. Storing per-kg avoids the rounding-to-zero trap that the old
 * cents-per-gram unit had for cheap materials.
 * partsPer1000 is the component's share of a 1000-part formula.
 * Returns cost in MINOR units for a given batch size in grams.
 */
export function componentCostMinor(
  partsPer1000: number,
  priceMinorPerKg: number | null | undefined,
  batchG: number
): Decimal {
  if (priceMinorPerKg == null) return new Decimal(0);
  return new Decimal(partsPer1000)
    .div(1000)
    .times(batchG)
    .div(1000)
    .times(priceMinorPerKg);
}

export function totalCostMinor(
  components: Array<{ partsPer1000: number; priceMinorPerKg: number | null | undefined }>,
  batchG: number
): Decimal {
  return components.reduce(
    (acc, c) => acc.plus(componentCostMinor(c.partsPer1000, c.priceMinorPerKg, batchG)),
    new Decimal(0)
  );
}
