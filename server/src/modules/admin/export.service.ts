import type { Money } from '@shop/shared';

import { csvMoney, toCsv, type CsvColumn } from '../../lib/csv';
import { CustomerModel } from '../../models/customer.model';
import { OrderModel } from '../../models/order.model';
import { ProductModel } from '../../models/product.model';

/**
 * Exports are ONE ROW PER VARIANT, not per product.
 *
 * A merchant exporting the catalogue is almost always doing a stock take or a
 * price review, and both happen at the size × colour level. A product-level
 * export would need the variants flattened into a cell, which no spreadsheet can
 * filter or sum.
 */
export const exportProducts = async (): Promise<string> => {
  const products = await ProductModel.find().sort({ name: 1 }).lean();

  const rows = products.flatMap((product) =>
    product.variants.map((variant) => ({ product, variant })),
  );

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: 'SKU', value: (row) => row.variant.sku },
    { header: 'Product', value: (row) => row.product.name },
    { header: 'Slug', value: (row) => row.product.slug },
    { header: 'Brand', value: (row) => row.product.brand },
    { header: 'Status', value: (row) => row.product.status },
    { header: 'Department', value: (row) => row.product.department },
    { header: 'Colour', value: (row) => row.variant.colour },
    { header: 'Size', value: (row) => row.variant.size.toUpperCase() },
    { header: 'Price (INR)', value: (row) => csvMoney(row.variant.price) },
    { header: 'MRP (INR)', value: (row) => csvMoney(row.variant.compareAtPrice) },
    { header: 'Stock', value: (row) => row.variant.stockQuantity ?? 0 },
    { header: 'Sellable', value: (row) => (row.variant.isEnabled ? 'yes' : 'no') },
    { header: 'Fabric', value: (row) => row.product.fabric ?? '' },
    { header: 'Fit', value: (row) => row.product.fit ?? '' },
    { header: 'Occasion', value: (row) => row.product.occasion ?? '' },
    { header: 'Rating', value: (row) => row.product.ratingAverage ?? '' },
    { header: 'Reviews', value: (row) => row.product.reviewCount ?? 0 },
  ];

  return toCsv(rows, columns);
};

/** One row per order LINE — the shape a fulfilment or accounts team works from. */
export const exportOrders = async (from?: Date, to?: Date): Promise<string> => {
  const filter: Record<string, unknown> = {};
  if (from || to) {
    filter.placedAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  const orders = await OrderModel.find(filter).sort({ placedAt: -1 }).lean();
  const rows = orders.flatMap((order) => order.lines.map((line) => ({ order, line })));

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: 'Reference', value: (row) => row.order.reference },
    { header: 'Placed', value: (row) => row.order.placedAt.toISOString() },
    { header: 'Status', value: (row) => row.order.status },
    { header: 'Payment', value: (row) => row.order.paymentMethod },
    { header: 'Payment status', value: (row) => row.order.paymentStatus },
    { header: 'Email', value: (row) => row.order.email },
    { header: 'SKU', value: (row) => row.line.sku },
    { header: 'Item', value: (row) => row.line.name },
    { header: 'Size', value: (row) => row.line.size.toUpperCase() },
    { header: 'Colour', value: (row) => row.line.colourLabel },
    { header: 'Qty', value: (row) => row.line.quantity },
    { header: 'Unit price (INR)', value: (row) => csvMoney(row.line.unitPrice) },
    { header: 'Line total (INR)', value: (row) => csvMoney(row.line.lineTotal) },
    // Repeated on every line of an order on purpose: a pivot table needs the
    // value on the row, and a merchant filtering to one SKU still wants to see
    // what the whole order was worth.
    { header: 'Order total (INR)', value: (row) => csvMoney(row.order.totals.grandTotal) },
    { header: 'Order GST (INR)', value: (row) => csvMoney(row.order.totals.taxIncluded) },
    { header: 'Coupon', value: (row) => row.order.couponCode ?? '' },
    { header: 'City', value: (row) => row.order.shippingAddress.city },
    { header: 'State', value: (row) => row.order.shippingAddress.state },
    { header: 'PIN', value: (row) => row.order.shippingAddress.postalCode },
  ];

  return toCsv(rows, columns);
};

export const exportCustomers = async (): Promise<string> => {
  const customers = await CustomerModel.find().sort({ createdAt: -1 }).lean();

  // Order counts and lifetime value in one aggregation rather than a query per
  // customer — the difference between one round trip and several hundred.
  const totals = await OrderModel.aggregate<{
    _id: string;
    orders: number;
    spend: number;
  }>([
    { $match: { status: { $nin: ['cancelled', 'returned'] } } },
    {
      $group: {
        _id: '$email',
        orders: { $sum: 1 },
        spend: { $sum: '$totals.grandTotal.amount' },
      },
    },
  ]);

  const byEmail = new Map(totals.map((entry) => [entry._id, entry]));

  const columns: CsvColumn<(typeof customers)[number]>[] = [
    { header: 'Email', value: (row) => row.email },
    { header: 'First name', value: (row) => row.firstName },
    { header: 'Last name', value: (row) => row.lastName },
    { header: 'Phone', value: (row) => row.phone ?? '' },
    { header: 'Orders', value: (row) => byEmail.get(row.email)?.orders ?? 0 },
    {
      header: 'Lifetime value (INR)',
      value: (row) =>
        csvMoney({ amount: byEmail.get(row.email)?.spend ?? 0 } as Money),
    },
    { header: 'Addresses', value: (row) => row.addresses.length },
    { header: 'Wishlist items', value: (row) => row.wishlist.length },
    { header: 'Marketing opt-in', value: (row) => (row.acceptsMarketing ? 'yes' : 'no') },
    { header: 'Joined', value: (row) => (row.createdAt ?? new Date()).toISOString() },
  ];

  return toCsv(customers, columns);
};
