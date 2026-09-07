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

export const PAYMENT_METHODS = ['cod', 'upi', 'bank_transfer', 'card', 'netbanking'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Who actually moves the money.
 *
 * The method is what the shopper picked; the provider is how the shop collects
 * it, and the two are deliberately separate. UPI is `manual` for a shop with no
 * gateway account and `razorpay` for one that has signed up — the shopper picks
 * the same tile either way, and no order record has to be reinterpreted when the
 * shop switches over.
 */
export const PAYMENT_PROVIDERS = ['none', 'manual', 'razorpay'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/**
 * Where the money is, from the shop's point of view.
 *
 * `pending` and `awaiting_payment` are not the same thing and collapsing them
 * loses the distinction the shop runs on: `pending` is cash on delivery, where
 * nothing is owed until the courier arrives and the order ships regardless.
 * `awaiting_payment` is a shopper who has to transfer now and has not, whose
 * goods must not be packed and whose stock has to come back if they never do.
 *
 * `verifying` is the state a manual transfer sits in between the shopper saying
 * they paid and a human at the shop confirming it against the bank statement.
 * It exists because those are different claims and only one of them is evidence.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'awaiting_payment',
  'verifying',
  'paid',
  'failed',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Payment states from which no further money may be taken. */
export const SETTLED_PAYMENT_STATUSES = ['paid', 'refunded'] as const;

/**
 * Order states that must never be paid.
 *
 * Accepting money against one of these sells goods the shop is no longer
 * shipping, and then reports the revenue on the dashboard. The rule lives here,
 * once, so that the manual verifier and the gateway callback cannot disagree.
 */
export const STOCK_RELEASED_ORDER_STATUSES = ['cancelled', 'returned'] as const;

/**
 * Order states in which the goods are still on the shop's own shelves.
 *
 * This is what decides whether cancelling gives the stock back. Cancelling a
 * `packed` order returns three shirts to sale, because they are in the building.
 * Cancelling a `shipped` one must NOT — those shirts are on a van, and putting
 * them back on sale sells the same garment twice. They return through a return,
 * once someone has them in their hands again.
 */
export const PRE_DISPATCH_ORDER_STATUSES = ['pending', 'confirmed', 'packed'] as const;

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
  payment: OrderPaymentView;
  /**
   * When this order's reserved stock went back on sale, if it ever did.
   *
   * On the order rather than inferred from the status, because the question is
   * "has this already happened" and a status can be reached twice. It is what
   * stops a cancel, a sweep and a second cancel from returning the same three
   * shirts to sale three times.
   */
  stockReleasedAt: string | null;
  /** Set once shipped. */
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  placedAt: string;
  updatedAt: string;
}

/**
 * The payment trail carried on the order itself.
 *
 * Kept on the order rather than in a side collection because every question a
 * merchant asks about a payment — did it arrive, who confirmed it, what did the
 * shopper quote — is asked while looking at the order, and a join that can fail
 * is a worse answer than a field that cannot.
 */
export interface OrderPaymentView {
  provider: PaymentProvider;
  /** The UTR or bank reference the shopper typed back after transferring. */
  reference: string | null;
  /** When the shopper said they had paid. */
  claimedAt: string | null;
  /** When a human, or the gateway, confirmed the money had actually arrived. */
  verifiedAt: string | null;
  /** Who confirmed it. A staff name for a manual verification, else null. */
  verifiedBy: string | null;
  /** Why a claim was sent back. Shown to the shopper so they can correct it. */
  rejectionReason: string | null;
  /** How many times the shopper has submitted a reference. */
  claimCount: number;
  /** Gateway identifiers. Null on a manual or cash order. */
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  /** When an unpaid order gives its stock back. Null once paid. */
  expiresAt: string | null;
}

/**
 * What a shopper needs in order to pay by hand.
 *
 * Built per request from store settings and never stored: bank details change,
 * and an order that reprinted last year's account number would send money to an
 * account the shop may no longer hold.
 */
export interface ManualPaymentInstructions {
  amount: Money;
  /** The order reference, to be quoted in the transfer note. */
  reference: string;
  upi: {
    id: string;
    name: string;
    /** `upi://pay?…` with the amount and reference filled in. One tap on a phone. */
    link: string;
    /** The same string as a QR data URI, for whoever is on a laptop. */
    qr: string;
  } | null;
  bank: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    ifsc: string;
  } | null;
  /** When the order releases its stock if nothing arrives. */
  expiresAt: string | null;
}

/**
 * The handoff a gateway checkout needs. Contains the PUBLISHABLE key only —
 * the secret signs and verifies on the server and never reaches a browser.
 */
export interface GatewayCheckoutHandoff {
  provider: 'razorpay';
  keyId: string;
  gatewayOrderId: string;
  amount: Money;
  orderReference: string;
  storeName: string;
  email: string;
  phone: string;
}

export interface PlaceOrderRequest {
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  /** Optional: guests check out with an email and no account. */
  email?: string;
}

/**
 * Checkout answers with the order AND what has to happen next.
 *
 * Returning the order alone would leave the client guessing whether money is
 * owed, and the guess would be wrong the moment the shop turns a gateway on.
 * Exactly one of `manual` and `gateway` is set, or neither for cash on delivery.
 */
export interface PlaceOrderResponse {
  order: OrderView;
  manual: ManualPaymentInstructions | null;
  gateway: GatewayCheckoutHandoff | null;
}

/** What the shopper submits after transferring the money themselves. */
export interface ClaimPaymentRequest {
  /** UPI UTR, NEFT/IMPS reference — whatever their bank gave them. */
  reference: string;
}

/** What the browser hands back after a Razorpay checkout closes successfully. */
export interface GatewayVerifyRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Which payment tiles the storefront should offer.
 *
 * Served from the API rather than hardcoded in the client, because the answer
 * depends on settings and on whether gateway keys are configured — and a tile
 * the server would refuse is worse than no tile at all.
 */
export interface PaymentOptionView {
  method: PaymentMethod;
  provider: PaymentProvider;
  title: string;
  note: string;
}
