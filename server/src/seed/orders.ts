import { money, newId, type Size } from '@shop/shared';

import type { ProductDoc } from '../models/product.model';

/**
 * A demo shop's order history.
 *
 * Without it the dashboard is four zeroes and two empty charts, which tells you
 * nothing about whether any of it works — and is what a merchant evaluating the
 * panel would open first. So the seed writes eight weeks of trading.
 *
 * It is generated rather than listed because the shape matters more than the
 * particular rows: takings that rise and fall by weekday, orders spread across
 * every stage of the workflow, a few transfers still waiting on somebody, and
 * enough repeat buyers that "customers" is not simply "orders".
 */

/** Same hash as the catalogue seed: varied, and identical on every run. */
const rand = (key: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
};

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A reference that looks arbitrary and is guaranteed not to repeat.
 *
 * `rand` yields only ten thousand distinct values, so six characters drawn from
 * it collide well before two hundred orders — and `reference` is uniquely
 * indexed, so the collision is not a cosmetic one: the whole insert fails. The
 * salt is retried until the set accepts it, which keeps the output deterministic
 * while making a duplicate impossible by construction.
 */
const referenceFor = (key: string, taken: Set<string>): string => {
  for (let salt = 0; ; salt += 1) {
    let suffix = '';
    for (let index = 0; index < 6; index += 1) {
      suffix += REFERENCE_ALPHABET[
        Math.floor(rand(`${key}:ref:${salt}:${index}`) * REFERENCE_ALPHABET.length)
      ];
    }
    const reference = `TL-${suffix}`;
    if (!taken.has(reference)) {
      taken.add(reference);
      return reference;
    }
  }
};

const BUYERS = [
  { name: 'Aditi Sharma', email: 'demo@threadline.shop', city: 'Mumbai', state: 'Maharashtra', pin: '400050' },
  { name: 'Rohan Mehta', email: 'rohan.mehta@example.com', city: 'Pune', state: 'Maharashtra', pin: '411001' },
  { name: 'Kavya Nair', email: 'kavya.nair@example.com', city: 'Kochi', state: 'Kerala', pin: '682016' },
  { name: 'Arjun Reddy', email: 'arjun.reddy@example.com', city: 'Hyderabad', state: 'Telangana', pin: '500034' },
  { name: 'Meera Iyer', email: 'meera.iyer@example.com', city: 'Chennai', state: 'Tamil Nadu', pin: '600028' },
  { name: 'Vikram Singh', email: 'vikram.singh@example.com', city: 'Jaipur', state: 'Rajasthan', pin: '302001' },
  { name: 'Sana Qureshi', email: 'sana.qureshi@example.com', city: 'Delhi', state: 'Delhi', pin: '110016' },
  { name: 'Dev Patel', email: 'dev.patel@example.com', city: 'Ahmedabad', state: 'Gujarat', pin: '380009' },
];

/**
 * How an order that reached a given age has most likely ended up.
 *
 * Old orders are delivered, this week's are still moving, and a slice of each is
 * cancelled or returned — a demo where nothing ever goes wrong hides every
 * screen built for when it does.
 */
const outcomeFor = (
  daysAgo: number,
  roll: number,
): { status: string; paymentStatus: string; provider: 'none' | 'manual' } => {
  // Cash on delivery: confirmed on trust, paid when the courier collects.
  if (roll > 0.82) {
    if (daysAgo > 6) return { status: 'delivered', paymentStatus: 'paid', provider: 'none' };
    return { status: 'confirmed', paymentStatus: 'pending', provider: 'none' };
  }

  if (roll < 0.06) return { status: 'cancelled', paymentStatus: 'failed', provider: 'manual' };
  if (roll < 0.10 && daysAgo > 10) {
    return { status: 'returned', paymentStatus: 'refunded', provider: 'manual' };
  }

  /**
   * The two states that put work in front of staff.
   *
   * Kept to the last three days so the payments queue has something in it
   * without the shop looking neglected — and wide enough that it is never
   * empty, because an empty queue cannot show whether the screen works.
   */
  if (daysAgo <= 3 && roll > 0.34 && roll < 0.62) {
    return { status: 'pending', paymentStatus: 'verifying', provider: 'manual' };
  }
  if (daysAgo <= 2 && roll >= 0.62 && roll < 0.74) {
    return { status: 'pending', paymentStatus: 'awaiting_payment', provider: 'manual' };
  }

  if (daysAgo > 8) return { status: 'delivered', paymentStatus: 'paid', provider: 'manual' };
  if (daysAgo > 4) return { status: 'shipped', paymentStatus: 'paid', provider: 'manual' };
  if (daysAgo > 2) return { status: 'packed', paymentStatus: 'paid', provider: 'manual' };
  return { status: 'confirmed', paymentStatus: 'paid', provider: 'manual' };
};

export interface SeedOrderResult {
  orders: Record<string, unknown>[];
  buyers: typeof BUYERS;
}

export const buildSeedOrders = (
  products: ProductDoc[],
  settings: { codSurcharge: number; freeAbove: number; standard: number },
  days = 60,
): SeedOrderResult => {
  const orders: Record<string, unknown>[] = [];
  const references = new Set<string>();
  // One clock for the whole run, so the cutoff cannot drift mid-generation.
  const now = new Date();
  const sellable = products.filter((product) => product.variants.some((v) => v.stockQuantity > 0));

  for (let daysAgo = days; daysAgo >= 0; daysAgo -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const weekday = date.getDay();

    /**
     * Weekends are busier, and there is a slow climb across the window.
     *
     * A flat rate produces a chart that is a straight line of identical bars,
     * which looks like placeholder data because it is.
     */
    const busy = weekday === 0 || weekday === 6 ? 1.6 : 1;
    const growth = 0.7 + ((days - daysAgo) / days) * 0.7;
    const count = Math.round((0.6 + rand(`day:${daysAgo}`) * 2.2) * busy * growth);

    for (let index = 0; index < count; index += 1) {
      const key = `${daysAgo}:${index}`;
      const buyer = BUYERS[Math.floor(rand(`${key}:buyer`) * BUYERS.length)]!;
      const lineCount = rand(`${key}:lines`) > 0.72 ? 2 : 1;

      const lines = [];
      for (let line = 0; line < lineCount; line += 1) {
        const product = sellable[Math.floor(rand(`${key}:p${line}`) * sellable.length)]!;
        const variants = product.variants.filter((v) => v.stockQuantity > 0);
        const variant = variants[Math.floor(rand(`${key}:v${line}`) * variants.length)]!;
        const quantity = rand(`${key}:q${line}`) > 0.85 ? 2 : 1;
        const colourway = product.colourways.find((c) => c.code === variant.colour);

        lines.push({
          productId: product._id,
          variantId: variant.id,
          productSlug: product.slug,
          name: product.name,
          brand: product.brandCode,
          sku: variant.sku,
          size: variant.size as Size,
          colour: variant.colour,
          colourLabel: colourway?.label ?? variant.colour,
          imageUrl: colourway?.images[0]?.url ?? null,
          quantity,
          unitPrice: money(variant.price.amount),
          compareAtPrice: null,
          lineTotal: money(variant.price.amount * quantity),
        });
      }

      const outcome = outcomeFor(daysAgo, rand(`${key}:outcome`));
      const subtotal = lines.reduce((total, line) => total + line.lineTotal.amount, 0);
      const shipping =
        (subtotal >= settings.freeAbove ? 0 : settings.standard) +
        (outcome.provider === 'none' ? settings.codSurcharge : 0);
      const grandTotal = subtotal + shipping;

      /**
       * Tax is EXTRACTED from a tax-inclusive total, at the 12% band.
       *
       * An approximation, and flagged as one: the real calculator bands per unit
       * and the seed does not re-derive that. It is close enough for a chart and
       * would be wrong on an invoice, which is why nothing reads it back.
       */
      const taxIncluded = Math.round(grandTotal - grandTotal / 1.12);

      const placedAt = new Date(date);
      placedAt.setHours(9 + Math.floor(rand(`${key}:hour`) * 12), Math.floor(rand(`${key}:min`) * 60), 0, 0);

      /**
       * Today's orders cannot be later than right now.
       *
       * Trading hours run to 21:00, so seeding at midday put three of them in
       * the future — and a shop that has taken an order at nine tonight is not
       * a thing. It also broke something real: "the newest order" was a seeded
       * one dated later today, so a genuinely new order was never the newest
       * and the desktop alert never fired.
       *
       * Pulled back into the hour before now rather than clamped to it, so the
       * most recent orders do not all share one timestamp.
       */
      if (placedAt.getTime() > now.getTime()) {
        placedAt.setTime(now.getTime() - Math.floor(rand(`${key}:back`) * 3_600_000) - 60_000);
      }

      const reference = referenceFor(key, references);
      const isSettled = outcome.paymentStatus === 'paid' || outcome.paymentStatus === 'refunded';

      orders.push({
        _id: newId('ord'),
        reference,
        customerId: null,
        email: buyer.email,
        status: outcome.status,
        lines,
        totals: {
          mrpTotal: money(subtotal),
          subtotal: money(subtotal),
          savings: money(0),
          couponDiscount: money(0),
          shipping: money(shipping),
          taxIncluded: money(taxIncluded),
          grandTotal: money(grandTotal),
        },
        couponCode: null,
        shippingAddress: {
          fullName: buyer.name,
          phone: '98765' + String(43000 + Math.floor(rand(`${key}:phone`) * 999)),
          line1: `${1 + Math.floor(rand(`${key}:door`) * 90)} Residency Road`,
          line2: null,
          city: buyer.city,
          state: buyer.state,
          postalCode: buyer.pin,
          country: 'IN',
        },
        paymentMethod: outcome.provider === 'none' ? 'cod' : 'upi',
        paymentStatus: outcome.paymentStatus,
        payment: {
          provider: outcome.provider,
          reference:
            outcome.provider === 'manual' && outcome.paymentStatus !== 'awaiting_payment'
              ? String(400_000_000_000 + Math.floor(rand(`${key}:utr`) * 99_999_999_999))
              : null,
          claimedAt: outcome.paymentStatus === 'verifying' || isSettled ? placedAt : null,
          verifiedAt: isSettled ? new Date(placedAt.getTime() + 3_600_000) : null,
          verifiedBy: isSettled && outcome.provider === 'manual' ? 'Priya Menon' : null,
          rejectionReason: null,
          claimCount: outcome.provider === 'manual' ? 1 : 0,
          gatewayOrderId: null,
          gatewayPaymentId: null,
          expiresAt:
            outcome.paymentStatus === 'awaiting_payment'
              ? new Date(Date.now() + 12 * 3_600_000)
              : null,
        },
        // Cancelled and returned orders have handed their stock back, and the
        // field has to say so or the panel will offer to release it again.
        stockReleasedAt:
          outcome.status === 'cancelled' || outcome.status === 'returned'
            ? new Date(placedAt.getTime() + 7_200_000)
            : null,
        trackingNumber:
          outcome.status === 'shipped' || outcome.status === 'delivered'
            ? `DL${Math.floor(rand(`${key}:awb`) * 900_000_000 + 100_000_000)}`
            : null,
        estimatedDelivery: new Date(placedAt.getTime() + 5 * 86_400_000),
        placedAt,
        createdAt: placedAt,
        updatedAt: placedAt,
      });
    }
  }

  return { orders, buyers: BUYERS };
};
