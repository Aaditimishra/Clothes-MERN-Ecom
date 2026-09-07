import {
  addMoney,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  taxWithin,
  type CartTotals,
  type Money,
} from '@shop/shared';

import type { StoreSettings, TaxBand } from '../modules/settings/settings.service';

/**
 * GST on apparel is BANDED, and the band applies per unit.
 *
 * A garment under ₹1,000 is taxed at 5%, at or above it at 12%. The per-unit
 * part is the trap: two ₹600 shirts are 5% each, not 12% on a ₹1,200 line. Any
 * implementation that bands the line total instead overcharges exactly the
 * customers who buy two of something cheap.
 *
 * The bands are stored in settings, so a rate change is an admin edit rather
 * than a deployment — which is the point, because the boundary moves with policy.
 */
export const taxRateFor = (unitPrice: Money, bands: readonly TaxBand[]): number => {
  const band = bands.find(
    (candidate) =>
      unitPrice.amount >= candidate.minUnitAmount &&
      (candidate.maxUnitAmount === null || unitPrice.amount < candidate.maxUnitAmount),
  );

  // The bands are expected to cover [0, ∞) with no gap. If a merchant leaves one,
  // the highest band applies — erring towards collecting too much tax rather
  // than too little, which is the recoverable mistake of the two.
  return band?.rate ?? bands[bands.length - 1]?.rate ?? 0;
};

/** Displayed prices already include GST, as Indian retail requires. */
export const taxIncludedIn = (
  unitPrice: Money,
  quantity: number,
  bands: readonly TaxBand[],
): Money => taxWithin(multiplyMoney(unitPrice, quantity), taxRateFor(unitPrice, bands));

export interface PricedLine {
  unitPrice: Money;
  compareAtPrice: Money | null;
  quantity: number;
}

export interface TotalsInput {
  lines: readonly PricedLine[];
  settings: StoreSettings;
  couponDiscount?: Money;
  /** Cash on delivery adds a surcharge; other methods do not. */
  isCashOnDelivery?: boolean;
}

/**
 * The single place totals are computed.
 *
 * Bag, checkout and order all call this, which is the only way the number the
 * shopper sees in the bag can be guaranteed to equal the number on their
 * invoice. Duplicating it "just for the bag" is how those two drift apart.
 */
export const computeTotals = ({
  lines,
  settings,
  couponDiscount = money(0),
  isCashOnDelivery = false,
}: TotalsInput): CartTotals => {
  const { taxBands, shipping } = settings;

  const subtotal = sumMoney(
    lines.map((line) => multiplyMoney(line.unitPrice, line.quantity)),
  );

  const mrpTotal = sumMoney(
    lines.map((line) =>
      multiplyMoney(line.compareAtPrice ?? line.unitPrice, line.quantity),
    ),
  );

  // A coupon can never take the bag below zero, and it is capped before it
  // reaches the tax and shipping maths so a generous code cannot mint money.
  const cappedCoupon = money(Math.min(couponDiscount.amount, subtotal.amount));
  const payableGoods = subtractMoney(subtotal, cappedCoupon);

  const deliveryFee =
    payableGoods.amount === 0 || payableGoods.amount >= shipping.freeAbove.amount
      ? money(0)
      : shipping.standard;

  const surcharge = isCashOnDelivery ? shipping.codSurcharge : money(0);
  const shippingTotal = addMoney(deliveryFee, surcharge);

  /**
   * Tax is reported on what is actually paid for the goods.
   *
   * The coupon reduces the taxable value proportionally rather than being
   * ignored — a ₹500 discount on a ₹2,000 bag means GST is owed on ₹1,500, and
   * reporting it on ₹2,000 overstates the shop's liability on every invoice.
   */
  const grossTax = sumMoney(
    lines.map((line) => taxIncludedIn(line.unitPrice, line.quantity, taxBands)),
  );

  const taxIncluded =
    subtotal.amount === 0
      ? money(0)
      : money(Math.round((grossTax.amount * payableGoods.amount) / subtotal.amount));

  return {
    mrpTotal,
    subtotal,
    savings: subtractMoney(mrpTotal, subtotal),
    couponDiscount: cappedCoupon,
    shipping: shippingTotal,
    taxIncluded,
    grandTotal: addMoney(payableGoods, shippingTotal),
  };
};

/** `null` once free delivery is earned; otherwise how much more to spend. */
export const freeShippingShortfall = (
  totals: CartTotals,
  settings: StoreSettings,
): Money | null => {
  const payableGoods = subtractMoney(totals.subtotal, totals.couponDiscount);
  if (payableGoods.amount === 0) return null;

  const gap = settings.shipping.freeAbove.amount - payableGoods.amount;
  return gap > 0 ? money(gap) : null;
};
