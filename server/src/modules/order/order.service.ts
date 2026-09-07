import {
  multiplyMoney,
  newId,
  type Address,
  type OrderView,
  type PaymentMethod,
  type PaymentStatus,
  type Size,
} from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { computeTotals, type PricedLine } from '../../lib/pricing';
import { getSettings } from '../settings/settings.service';
import { CartModel } from '../../models/cart.model';
import { CustomerModel } from '../../models/customer.model';
import { OrderModel, type OrderDoc } from '../../models/order.model';
import { ProductModel, type ProductDoc } from '../../models/product.model';
import { buildCartView, requireCart, type CartKey } from '../cart/cart.service';
import { claimCouponUse } from '../promotion/promotion.service';
import { lowStockThreshold, onOrderPlaced } from '../notification/notification.service';

/**
 * A short reference a person can read down a phone line.
 *
 * The alphabet omits I, O, 0 and 1 on purpose — those are the characters support
 * calls lose ten minutes to. Collisions are caught by the unique index and
 * retried rather than prevented by a longer, less readable code.
 */
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const newReference = (): string => {
  let suffix = '';
  for (let index = 0; index < 6; index += 1) {
    suffix += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
  }
  return `TL-${suffix}`;
};

export const toOrderView = (order: OrderDoc): OrderView => ({
  id: order._id,
  reference: order.reference,
  status: order.status as OrderView['status'],
  lines: order.lines.map((line) => ({
    variantId: line.variantId,
    productId: line.productId,
    productSlug: line.productSlug,
    name: line.name,
    brand: line.brand,
    sku: line.sku,
    size: line.size as Size,
    colour: line.colour,
    colourLabel: line.colourLabel,
    imageUrl: line.imageUrl ?? null,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    compareAtPrice: line.compareAtPrice ?? null,
    lineTotal: line.lineTotal,
  })),
  itemCount: order.lines.reduce((count, line) => count + line.quantity, 0),
  totals: order.totals,
  couponCode: order.couponCode ?? null,
  shippingAddress: {
    ...order.shippingAddress,
    line2: order.shippingAddress.line2 ?? null,
  },
  paymentMethod: order.paymentMethod as PaymentMethod,
  paymentStatus: order.paymentStatus as PaymentStatus,
  trackingNumber: order.trackingNumber ?? null,
  estimatedDelivery: order.estimatedDelivery?.toISOString() ?? null,
  placedAt: order.placedAt.toISOString(),
  updatedAt: (order.updatedAt ?? order.placedAt).toISOString(),
});

/**
 * Reserves stock for one variant, atomically.
 *
 * The quantity guard lives in the FILTER, not in an `if` above the update. Two
 * shoppers buying the last shirt at the same moment both pass a read-then-check;
 * here the second update matches no document and returns false, and the caller
 * rolls back. This is the difference between overselling and not.
 */
const reserveStock = async (variantId: string, quantity: number): Promise<boolean> => {
  const result = await ProductModel.updateOne(
    {
      variants: {
        $elemMatch: { id: variantId, isEnabled: true, stockQuantity: { $gte: quantity } },
      },
    },
    { $inc: { 'variants.$.stockQuantity': -quantity } },
  );

  return result.modifiedCount === 1;
};

const releaseStock = async (variantId: string, quantity: number): Promise<void> => {
  await ProductModel.updateOne(
    { 'variants.id': variantId },
    { $inc: { 'variants.$.stockQuantity': quantity } },
  );
};

export interface PlaceOrderInput {
  key: CartKey;
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  email: string;
}

/**
 * Turns a bag into an order.
 *
 * The sequence matters. Stock is reserved BEFORE the order is written, and every
 * successful reservation is undone if a later one fails — so the shop never ends
 * up with an order it cannot fulfil, nor with stock quietly held by an order that
 * was never created. Without a replica set there are no transactions to lean on,
 * so the compensating release is the guarantee.
 */
export const placeOrder = async ({
  key,
  shippingAddress,
  paymentMethod,
  email,
}: PlaceOrderInput): Promise<OrderView> => {
  const cart = await requireCart(key);
  const view = await buildCartView(cart);

  if (view.issues.length > 0) {
    throw ApiError.unprocessable(
      'Some items in your bag are no longer available',
      Object.fromEntries(view.issues.map((issue) => [issue.variantId, issue.message])),
    );
  }

  const products = await ProductModel.find({
    _id: { $in: view.lines.map((line) => line.productId) },
  }).lean();
  const byId = new Map((products as ProductDoc[]).map((product) => [product._id, product]));

  const reserved: Array<{ variantId: string; quantity: number }> = [];

  try {
    for (const line of view.lines) {
      if (!(await reserveStock(line.variantId, line.quantity))) {
        throw ApiError.unprocessable(
          `${line.name} in ${line.size.toUpperCase()} sold out while you were checking out`,
        );
      }
      reserved.push({ variantId: line.variantId, quantity: line.quantity });
    }

    const pricedLines: PricedLine[] = view.lines.map((line) => ({
      unitPrice: line.unitPrice,
      compareAtPrice: line.compareAtPrice,
      quantity: line.quantity,
    }));

    // The coupon is claimed only once stock is secured, and a coupon that ran out
    // in the meantime simply does not apply — the order still goes through at the
    // undiscounted price rather than failing after the stock is held.
    const couponClaimed = view.coupon ? await claimCouponUse(view.coupon.code) : false;
    const settings = await getSettings();
    const totals = computeTotals({
      lines: pricedLines,
      settings,
      ...(couponClaimed && view.coupon ? { couponDiscount: view.coupon.discount } : {}),
      isCashOnDelivery: paymentMethod === 'cod',
    });

    const order = await OrderModel.create({
      _id: newId('ord'),
      reference: newReference(),
      customerId: key.customerId ?? null,
      email: email.toLowerCase(),
      status: 'confirmed',
      lines: view.lines.map((line) => {
        const product = byId.get(line.productId);
        return {
          productId: line.productId,
          variantId: line.variantId,
          productSlug: line.productSlug,
          name: line.name,
          brand: line.brand,
          sku: line.sku,
          size: line.size,
          colour: line.colour,
          colourLabel: line.colourLabel,
          imageUrl: line.imageUrl ?? product?.colourways[0]?.images[0]?.url ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          compareAtPrice: line.compareAtPrice,
          lineTotal: multiplyMoney(line.unitPrice, line.quantity),
        };
      }),
      totals,
      couponCode: couponClaimed && view.coupon ? view.coupon.code : null,
      shippingAddress,
      paymentMethod,
      /**
       * Card, UPI and netbanking are marked paid here because this shop has no
       * payment gateway wired in. The field exists and is honest about what it
       * means: cash on delivery is genuinely still pending until the courier
       * collects. Wiring a real gateway means changing this one line.
       */
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      estimatedDelivery: new Date(
        Date.now() + settings.shipping.deliveryDays * 24 * 60 * 60 * 1000,
      ),
      placedAt: new Date(),
    });

    // The bag is deleted, not emptied. An emptied bag with a stale coupon
    // attached is a bug waiting for the shopper's next visit.
    await CartModel.deleteOne({ _id: cart._id });

    if (key.customerId) await rememberAddress(key.customerId, shippingAddress);

    const placed = toOrderView(order.toObject());

    /**
     * Notifications happen after the order is safely written, and never block it.
     *
     * The stock levels are read back post-reservation so the low-stock alert
     * reflects what is actually left, not what was there when the bag was built.
     */
    const restocked = await ProductModel.find({
      'variants.id': { $in: placed.lines.map((entry) => entry.variantId) },
    })
      .select('name variants.id variants.size variants.stockQuantity')
      .lean();

    const lowStock = placed.lines.flatMap((entry) => {
      const product = (restocked as ProductDoc[]).find((candidate) =>
        candidate.variants.some((variant) => variant.id === entry.variantId),
      );
      const variant = product?.variants.find((candidate) => candidate.id === entry.variantId);
      const left = variant?.stockQuantity ?? 0;

      return product && left <= lowStockThreshold
        ? [{ name: product.name, size: entry.size, left }]
        : [];
    });

    void onOrderPlaced(placed, email.toLowerCase(), lowStock);

    return placed;
  } catch (error) {
    await Promise.all(
      reserved.map((entry) => releaseStock(entry.variantId, entry.quantity)),
    );
    throw error;
  }
};

/**
 * Files the delivery address into the shopper's address book.
 *
 * The account page promises this ("one is saved automatically when you check
 * out") and used not to do it, which is worse than not offering it at all: a
 * shopper who trusts the message and finds an empty list next time has to type
 * the whole thing again.
 *
 * Deduplicated on the street line and PIN rather than the whole record, because
 * a shopper who corrects a typo in their own name should not end up with two
 * copies of one address. Failures are swallowed: an order that succeeded must
 * not be reported as failed because a convenience feature did not work.
 */
const rememberAddress = async (customerId: string, address: Address): Promise<void> => {
  try {
    const customer = await CustomerModel.findById(customerId);
    if (!customer) return;

    const key = (line1: string, postalCode: string) =>
      `${line1.trim().toLowerCase()}|${postalCode.trim()}`;

    const already = customer.addresses.some(
      (saved) => key(saved.line1, saved.postalCode) === key(address.line1, address.postalCode),
    );
    if (already) return;

    const isFirst = customer.addresses.length === 0;

    customer.addresses.push({
      id: newId('adr'),
      label: isFirst ? 'Home' : 'Delivery address',
      ...address,
      line2: address.line2 ?? null,
      // The first address a shopper ever saves becomes their default; later ones
      // do not quietly take over the one they already chose.
      isDefault: isFirst,
    } as never);

    await customer.save();
  } catch (error) {
    console.error('[order] could not save the delivery address', error);
  }
};

export const listOrders = async (customerId: string): Promise<OrderView[]> => {
  const orders = await OrderModel.find({ customerId }).sort({ placedAt: -1 }).lean();
  return (orders as OrderDoc[]).map(toOrderView);
};

/**
 * Looks an order up by its human reference.
 *
 * Guests have no account, so the reference alone would let anyone enumerate
 * orders. Pairing it with the email the order was placed under is what makes the
 * lookup safe without forcing a sign-up.
 */
export const findOrder = async (
  reference: string,
  identity: { customerId: string | null; email: string | null },
): Promise<OrderView> => {
  const order = await OrderModel.findOne({ reference: reference.toUpperCase() }).lean();
  if (!order) throw ApiError.notFound('No order with that reference');

  const isOwner =
    (identity.customerId !== null && order.customerId === identity.customerId) ||
    (identity.email !== null && order.email === identity.email.toLowerCase());

  if (!isOwner) throw ApiError.notFound('No order with that reference');

  return toOrderView(order as OrderDoc);
};

