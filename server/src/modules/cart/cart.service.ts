import {
  multiplyMoney,
  newId,
  sizeRank,
  type CartIssue,
  type CartLineView,
  type CartView,
  type Size,
} from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { computeTotals, freeShippingShortfall, type PricedLine } from '../../lib/pricing';
import { getSettings } from '../settings/settings.service';
import { CartModel, type CartDoc } from '../../models/cart.model';
import { ProductModel, type ProductDoc, type VariantDoc } from '../../models/product.model';
import { checkCoupon, tryCoupon } from '../promotion/promotion.service';

/** A shopper cannot take the whole shelf; retail carts cap per line. */
export const MAX_QUANTITY_PER_LINE = 10;

export interface CartKey {
  cartId: string | null;
  customerId: string | null;
}

/**
 * Finds the shopper's bag, creating one only when something is being added.
 *
 * A signed-in shopper is looked up by customer id first so their bag follows
 * them between devices; a guest is looked up by the opaque id in their browser.
 */
const findCart = async ({ cartId, customerId }: CartKey): Promise<CartDoc | null> => {
  if (customerId) {
    const owned = await CartModel.findOne({ customerId }).lean();
    if (owned) return owned;
  }
  return cartId ? CartModel.findById(cartId).lean() : null;
};

const createCart = async ({ customerId }: CartKey): Promise<CartDoc> => {
  const created = await CartModel.create({
    _id: newId('bag'),
    customerId: customerId ?? null,
    lines: [],
  });
  return created.toObject();
};

/**
 * Attaches a guest bag to the account that just signed in.
 *
 * The lines are MERGED rather than replaced. A shopper who filled a bag on their
 * phone as a guest and then signed in on their laptop should end up with both,
 * not with whichever one they touched last.
 */
export const mergeGuestCart = async (
  guestCartId: string,
  customerId: string,
): Promise<void> => {
  const [guest, owned] = await Promise.all([
    CartModel.findById(guestCartId),
    CartModel.findOne({ customerId }),
  ]);

  if (!guest || guest.customerId === customerId) {
    if (guest) await CartModel.updateOne({ _id: guest._id }, { customerId });
    return;
  }

  if (!owned) {
    await CartModel.updateOne({ _id: guest._id }, { customerId });
    return;
  }

  for (const line of guest.lines) {
    const existing = owned.lines.find((entry) => entry.variantId === line.variantId);
    if (existing) {
      existing.quantity = Math.min(
        MAX_QUANTITY_PER_LINE,
        existing.quantity + line.quantity,
      );
    } else {
      owned.lines.push(line);
    }
  }

  await owned.save();
  await CartModel.deleteOne({ _id: guest._id });
};

interface ResolvedLine {
  view: CartLineView;
  issue: CartIssue | null;
  priced: PricedLine | null;
}

const findVariant = (
  product: ProductDoc,
  variantId: string,
): VariantDoc | undefined => product.variants.find((variant) => variant.id === variantId);

/**
 * Turns a stored line (product id, variant id, quantity) into something the bag
 * page can render, pricing it from the live variant.
 */
const resolveLine = (
  product: ProductDoc | undefined,
  variantId: string,
  quantity: number,
): ResolvedLine | null => {
  const variant = product ? findVariant(product, variantId) : undefined;

  // The product or variant was deleted outright. There is nothing left to show
  // — not even a name — so the line is dropped rather than rendered as a ghost.
  if (!product || !variant) return null;

  const colourway = product.colourways.find((entry) => entry.code === variant.colour);
  const stock = variant.stockQuantity ?? 0;
  const isSellable = product.status === 'active' && variant.isEnabled === true;
  const available = isSellable ? stock : 0;
  const purchasable = Math.min(quantity, available);

  const view: CartLineView = {
    variantId: variant.id,
    productId: product._id,
    productSlug: product.slug,
    name: product.name,
    brand: product.brand,
    sku: variant.sku,
    size: variant.size as Size,
    colour: variant.colour,
    colourLabel: colourway?.label ?? variant.colour,
    imageUrl:
      colourway?.images[0]?.url ?? product.colourways[0]?.images[0]?.url ?? null,
    quantity,
    unitPrice: { amount: variant.price.amount, currency: variant.price.currency },
    compareAtPrice: variant.compareAtPrice
      ? {
          amount: variant.compareAtPrice.amount,
          currency: variant.compareAtPrice.currency,
        }
      : null,
    lineTotal: multiplyMoney(
      { amount: variant.price.amount, currency: variant.price.currency },
      purchasable,
    ),
    available,
    isAvailable: purchasable > 0,
  };

  let issue: CartIssue | null = null;
  if (!isSellable) {
    issue = {
      variantId: variant.id,
      code: 'unavailable',
      message: `${product.name} (${view.size.toUpperCase()}) is no longer available`,
      available: 0,
    };
  } else if (available === 0) {
    issue = {
      variantId: variant.id,
      code: 'out-of-stock',
      message: `${product.name} in ${view.size.toUpperCase()} has sold out`,
      available: 0,
    };
  } else if (quantity > available) {
    issue = {
      variantId: variant.id,
      code: 'reduced-stock',
      message: `Only ${available} left in ${view.size.toUpperCase()}`,
      available,
    };
  }

  return {
    view,
    issue,
    priced:
      purchasable > 0
        ? {
            unitPrice: view.unitPrice,
            compareAtPrice: view.compareAtPrice,
            quantity: purchasable,
          }
        : null,
  };
};

/**
 * Builds the bag the shopper sees.
 *
 * Totals are computed over what is actually PURCHASABLE, not over what the
 * shopper asked for. If two of the three shirts they wanted are left, the
 * summary shows the price of two — quoting three and then charging for two at
 * checkout is the kind of surprise that loses the whole order.
 */
export const buildCartView = async (cart: CartDoc): Promise<CartView> => {
  const products = await ProductModel.find({
    _id: { $in: cart.lines.map((line) => line.productId) },
  }).lean();

  const byId = new Map((products as ProductDoc[]).map((product) => [product._id, product]));

  const resolved = cart.lines.flatMap((line) => {
    const entry = resolveLine(byId.get(line.productId), line.variantId, line.quantity);
    return entry ? [entry] : [];
  });

  // Newest first within a product, then by size, so a bag with five sizes of the
  // same shirt reads in a sensible order instead of insertion order.
  resolved.sort(
    (left, right) =>
      left.view.name.localeCompare(right.view.name) ||
      sizeRank(left.view.size) - sizeRank(right.view.size),
  );

  const priced = resolved.flatMap((entry) => (entry.priced ? [entry.priced] : []));
  const settings = await getSettings();

  // Priced twice on purpose: a coupon with a minimum spend has to be judged
  // against the real subtotal, which is only known once the lines are priced.
  const provisional = computeTotals({ lines: priced, settings });
  const coupon = await tryCoupon(cart.couponCode ?? null, provisional.subtotal);
  const totals = computeTotals({
    lines: priced,
    settings,
    ...(coupon ? { couponDiscount: coupon.discount } : {}),
  });

  return {
    id: cart._id,
    lines: resolved.map((entry) => entry.view),
    itemCount: resolved.reduce((count, entry) => count + entry.view.quantity, 0),
    totals,
    coupon,
    issues: resolved.flatMap((entry) => (entry.issue ? [entry.issue] : [])),
    freeShippingShortfall: freeShippingShortfall(totals, settings),
    updatedAt: (cart.updatedAt ?? new Date()).toISOString(),
  };
};

const emptyCartView = async (): Promise<CartView> => {
  const totals = computeTotals({ lines: [], settings: await getSettings() });
  return {
    id: '',
    lines: [],
    itemCount: 0,
    totals,
    coupon: null,
    issues: [],
    freeShippingShortfall: null,
    updatedAt: new Date().toISOString(),
  };
};

export const getCart = async (key: CartKey): Promise<CartView> => {
  const cart = await findCart(key);
  return cart ? buildCartView(cart) : emptyCartView();
};

export const addItem = async (
  key: CartKey,
  variantId: string,
  quantity: number,
): Promise<CartView> => {
  const product = await ProductModel.findOne({
    status: 'active',
    'variants.id': variantId,
  }).lean();

  const variant = product ? findVariant(product as ProductDoc, variantId) : undefined;
  if (!product || !variant || !variant.isEnabled) {
    throw ApiError.notFound('That size is no longer available');
  }

  const cart = (await findCart(key)) ?? (await createCart(key));
  const existing = cart.lines.find((line) => line.variantId === variantId);
  const desired = (existing?.quantity ?? 0) + quantity;

  const stock = variant.stockQuantity ?? 0;
  if (stock === 0) {
    throw ApiError.unprocessable('That size has sold out');
  }

  // Clamped rather than rejected. A shopper who clicks "add" on the last item
  // twice wants the one that is left, not an error dialog.
  const capped = Math.min(desired, stock, MAX_QUANTITY_PER_LINE);

  const updated = await CartModel.findOneAndUpdate(
    { _id: cart._id },
    existing
      ? { $set: { 'lines.$[line].quantity': capped } }
      : {
          $push: {
            lines: { productId: product._id, variantId, quantity: capped, addedAt: new Date() },
          },
        },
    {
      new: true,
      ...(existing ? { arrayFilters: [{ 'line.variantId': variantId }] } : {}),
    },
  ).lean();

  return buildCartView(updated ?? cart);
};

export const setQuantity = async (
  key: CartKey,
  variantId: string,
  quantity: number,
): Promise<CartView> => {
  const cart = await findCart(key);
  if (!cart) throw ApiError.notFound('Your bag is empty');

  if (quantity === 0) return removeItem(key, variantId);

  const updated = await CartModel.findOneAndUpdate(
    { _id: cart._id, 'lines.variantId': variantId },
    { $set: { 'lines.$.quantity': Math.min(quantity, MAX_QUANTITY_PER_LINE) } },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('That item is not in your bag');
  return buildCartView(updated);
};

export const removeItem = async (
  key: CartKey,
  variantId: string,
): Promise<CartView> => {
  const cart = await findCart(key);
  if (!cart) throw ApiError.notFound('Your bag is empty');

  const updated = await CartModel.findOneAndUpdate(
    { _id: cart._id },
    { $pull: { lines: { variantId } } },
    { new: true },
  ).lean();

  return buildCartView(updated ?? cart);
};

export const applyCoupon = async (key: CartKey, code: string): Promise<CartView> => {
  const cart = await findCart(key);
  if (!cart || cart.lines.length === 0) {
    throw ApiError.unprocessable('Add something to your bag before using a code');
  }

  // Validated against the live subtotal so a minimum-spend rule is judged on
  // what is really in the bag, not on what was there when the code was typed.
  const { totals } = await buildCartView(cart);
  const { applied } = await checkCoupon(code, totals.subtotal);

  const updated = await CartModel.findOneAndUpdate(
    { _id: cart._id },
    { $set: { couponCode: applied.code } },
    { new: true },
  ).lean();

  return buildCartView(updated ?? cart);
};

export const removeCoupon = async (key: CartKey): Promise<CartView> => {
  const cart = await findCart(key);
  if (!cart) throw ApiError.notFound('Your bag is empty');

  const updated = await CartModel.findOneAndUpdate(
    { _id: cart._id },
    { $set: { couponCode: null } },
    { new: true },
  ).lean();

  return buildCartView(updated ?? cart);
};

/** Checkout needs the raw document, not the view, to snapshot its lines. */
export const requireCart = async (key: CartKey): Promise<CartDoc> => {
  const cart = await findCart(key);
  if (!cart || cart.lines.length === 0) {
    throw ApiError.unprocessable('Your bag is empty');
  }
  return cart;
};
