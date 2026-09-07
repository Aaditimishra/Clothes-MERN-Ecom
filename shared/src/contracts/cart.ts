import type { Money } from '../utils/money';
import type { Size } from './catalog';

/**
 * A shopper's bag.
 *
 * Note what a bag line does NOT store: the price. A bag can sit for a week, and
 * quoting a stale price is either a loss for the merchant or a broken promise to
 * the customer. Prices are resolved live from the variant on every read, by the
 * same pricing code checkout uses — so the number in the bag is the number
 * charged.
 */
export interface CartLineView {
  variantId: string;
  productId: string;
  productSlug: string;
  name: string;
  brand: string;
  sku: string;
  size: Size;
  colour: string;
  colourLabel: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: Money;
  compareAtPrice: Money | null;
  lineTotal: Money;
  /** Live availability. A bag may hold more than is left — say so, loudly. */
  available: number;
  isAvailable: boolean;
}

export interface CartIssue {
  variantId: string;
  code: 'out-of-stock' | 'reduced-stock' | 'unavailable';
  message: string;
  /** How many the shopper can actually have. */
  available: number;
}

export interface AppliedCoupon {
  code: string;
  description: string;
  discount: Money;
}

/**
 * Totals as the shopper reads them, top to bottom.
 *
 * `mrpTotal` minus `discount` is what apparel sites show as "you saved" — it is
 * the sum of struck-through prices, not a second discount. Keeping it separate
 * from `couponDiscount` is why the summary can explain itself line by line
 * instead of showing one unexplained number.
 */
export interface CartTotals {
  /** Sum of compare-at prices, for the "you saved" line. */
  mrpTotal: Money;
  /** Sum of line totals at the price actually charged. */
  subtotal: Money;
  /** `mrpTotal - subtotal`. Zero when nothing is discounted. */
  savings: Money;
  couponDiscount: Money;
  shipping: Money;
  /** GST already inside the prices above; shown for the invoice, never added. */
  taxIncluded: Money;
  grandTotal: Money;
}

export interface CartView {
  id: string;
  lines: CartLineView[];
  itemCount: number;
  totals: CartTotals;
  coupon: AppliedCoupon | null;
  /** Lines that cannot be bought right now, blocking checkout. */
  issues: CartIssue[];
  /** How much more to spend for free shipping; `null` once it is earned. */
  freeShippingShortfall: Money | null;
  updatedAt: string;
}

/** Header carrying a guest bag between requests. */
export const CART_ID_HEADER = 'x-cart-id';
