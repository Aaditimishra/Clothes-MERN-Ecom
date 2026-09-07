import { PRE_DISPATCH_ORDER_STATUSES, type OrderStatus } from '@shop/shared';

import { OrderModel, type OrderDoc } from '../../models/order.model';
import { ProductModel } from '../../models/product.model';

/**
 * Giving an order's reserved stock back.
 *
 * Stock is reserved the moment an order is written, so every path that ends an
 * order has to return it: an admin cancelling, the sweeper expiring an unpaid
 * one, a return coming back into the building. Three callers crediting the same
 * units is how a shop ends up with more shirts in the system than on the shelf,
 * and it is silent — nothing fails, the number is simply wrong, and it stays
 * wrong until someone counts by hand.
 *
 * So there is one function, and it can only succeed once per order.
 */

/** The goods are still in the building, so cancelling can put them back. */
export const isPreDispatch = (status: string): boolean =>
  (PRE_DISPATCH_ORDER_STATUSES as readonly string[]).includes(status);

export type ReleaseReason = 'cancelled' | 'expired' | 'returned';

/**
 * Returns an order's lines to sale, exactly once.
 *
 * The claim and the release are two steps on purpose. `findOneAndUpdate` with
 * `stockReleasedAt: null` in the FILTER is what makes this safe: two callers
 * racing both read null, but only one update matches, and only that one goes on
 * to credit the products. A read-then-check above the update would let both
 * through — which is the same mistake the reservation path was careful to avoid
 * on the way in.
 *
 * Returns true if this call is the one that released.
 */
export const releaseOrderStock = async (
  order: Pick<OrderDoc, '_id' | 'reference' | 'lines'>,
  reason: ReleaseReason,
): Promise<boolean> => {
  const claimed = await OrderModel.findOneAndUpdate(
    { _id: order._id, stockReleasedAt: null },
    { $set: { stockReleasedAt: new Date() } },
  ).lean();

  if (!claimed) return false;

  /**
   * Credited line by line rather than in one bulk write.
   *
   * A variant that has since been deleted matches nothing and is skipped, and
   * the rest of the order still goes back. A `bulkWrite` would be one round
   * trip instead of several, which for an order of two or three lines buys
   * milliseconds on a path that runs when an order ends — rarely, and never
   * while a shopper is waiting.
   */
  for (const line of order.lines) {
    await ProductModel.updateOne(
      { 'variants.id': line.variantId },
      { $inc: { 'variants.$.stockQuantity': line.quantity } },
    );
  }

  const units = order.lines.reduce((total, line) => total + line.quantity, 0);
  console.info(
    `[stock] ${order.reference} ${reason}: ${units} unit${units === 1 ? '' : 's'} back on sale`,
  );

  return true;
};

/**
 * Decides what a status change should do to stock, and does it.
 *
 * Called by whoever moves an order's status. The rules:
 *
 * - **cancelled from before dispatch** — the goods never left, so they go back.
 * - **cancelled after dispatch** — they are on a van. Putting them back on sale
 *   sells the same garment twice; they return through a return.
 * - **returned** — the goods are physically back, but a worn or damaged garment
 *   going straight back on sale is worse than one sitting in a box, so this is
 *   the merchant's call rather than an automatic credit. `restock` says they
 *   have looked at it.
 */
export const applyStatusChangeToStock = async (params: {
  order: OrderDoc;
  from: OrderStatus;
  to: OrderStatus;
  restock?: boolean;
}): Promise<boolean> => {
  const { order, from, to, restock } = params;

  if (to === 'cancelled' && isPreDispatch(from)) {
    return releaseOrderStock(order, 'cancelled');
  }

  if (to === 'returned' && restock === true) {
    return releaseOrderStock(order, 'returned');
  }

  return false;
};
