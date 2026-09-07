import {
  type OrderView,
  type PaymentMethod,
  type PaymentProvider,
  type PaymentStatus,
  type Size,
} from '@shop/shared';

import type { OrderDoc } from '../../models/order.model';

/**
 * The wire shape of an order.
 *
 * Lives apart from the service because both the order service and the payment
 * service need it, and having them reach into each other for it would make the
 * two modules mutually dependent — which works in ESM right up until one of
 * them grows a top-level constant and starts reading `undefined` at boot.
 */
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
  payment: {
    provider: (order.payment?.provider ?? 'none') as PaymentProvider,
    reference: order.payment?.reference ?? null,
    claimedAt: order.payment?.claimedAt?.toISOString() ?? null,
    verifiedAt: order.payment?.verifiedAt?.toISOString() ?? null,
    verifiedBy: order.payment?.verifiedBy ?? null,
    rejectionReason: order.payment?.rejectionReason ?? null,
    claimCount: order.payment?.claimCount ?? 0,
    gatewayOrderId: order.payment?.gatewayOrderId ?? null,
    gatewayPaymentId: order.payment?.gatewayPaymentId ?? null,
    expiresAt: order.payment?.expiresAt?.toISOString() ?? null,
  },
  trackingNumber: order.trackingNumber ?? null,
  estimatedDelivery: order.estimatedDelivery?.toISOString() ?? null,
  placedAt: order.placedAt.toISOString(),
  updatedAt: (order.updatedAt ?? order.placedAt).toISOString(),
});
