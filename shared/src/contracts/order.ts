import type { Money } from '../utils/money';
import type { CartLineView, CartTotals } from './cart';

/**
 * Order lifecycle.
 *
 * `returned` is a terminal state distinct from `cancelled`: apparel return rates
 * run an order of magnitude above most categories, and a shop that cannot tell a
 * return from a cancellation cannot measure the fit problem causing them.
 */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'cod'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface SavedAddress extends Address {
  id: string;
  label: string;
  isDefault: boolean;
}

/**
 * An order line is a SNAPSHOT, not a reference.
 *
 * The name, size, colour and price are copied at purchase time. If the merchant
 * later renames the product or repriced it, the order must still say what was
 * actually bought for how much — that is what the invoice and any dispute rest
 * on.
 */
export interface OrderLineView
  extends Omit<CartLineView, 'available' | 'isAvailable' | 'compareAtPrice'> {
  compareAtPrice: Money | null;
}

export interface OrderView {
  id: string;
  /** Short human reference, e.g. `TL-4K2X9`. What support asks for. */
  reference: string;
  status: OrderStatus;
  lines: OrderLineView[];
  itemCount: number;
  totals: CartTotals;
  couponCode: string | null;
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Set once shipped. */
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  placedAt: string;
  updatedAt: string;
}

export interface PlaceOrderRequest {
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  /** Optional: guests check out with an email and no account. */
  email?: string;
}
