import { model, Schema, type InferSchemaType } from 'mongoose';

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR', uppercase: true },
  },
  { _id: false },
);

/**
 * An order line is a SNAPSHOT, not a reference.
 *
 * Name, brand, size, colour and price are copied at purchase time. If the shop
 * later renames the product, repriced it or archived it, the order must still
 * say what was bought for how much — that is what the invoice, the return and
 * any dispute rest on. A line that joins back to the live product silently
 * rewrites history.
 */
const orderLineSchema = new Schema(
  {
    productId: { type: String, required: true },
    variantId: { type: String, required: true },
    productSlug: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String, required: true },
    sku: { type: String, required: true },
    size: { type: String, required: true },
    colour: { type: String, required: true },
    colourLabel: { type: String, required: true },
    imageUrl: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: moneySchema, required: true },
    compareAtPrice: { type: moneySchema, default: null },
    lineTotal: { type: moneySchema, required: true },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: null },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'IN' },
  },
  { _id: false },
);

const totalsSchema = new Schema(
  {
    mrpTotal: { type: moneySchema, required: true },
    subtotal: { type: moneySchema, required: true },
    savings: { type: moneySchema, required: true },
    couponDiscount: { type: moneySchema, required: true },
    shipping: { type: moneySchema, required: true },
    taxIncluded: { type: moneySchema, required: true },
    grandTotal: { type: moneySchema, required: true },
  },
  { _id: false },
);

/**
 * The payment trail, carried on the order.
 *
 * Every question a merchant asks about a payment — did it arrive, who said so,
 * what reference did the shopper quote — is asked while looking at the order,
 * so it lives on the order. A separate collection would add a join that can
 * fail to a question that must always have an answer.
 *
 * Gateway fields stay null on a manual order and vice versa. They are not
 * merged into one `reference` column because they mean different things: a UTR
 * is something a shopper typed and may have typed wrong, while a gateway
 * payment id is something the gateway asserted and can be reconciled against.
 */
const orderPaymentSchema = new Schema(
  {
    provider: { type: String, required: true, default: 'none' },
    reference: { type: String, default: null },
    claimedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    claimCount: { type: Number, default: 0 },
    gatewayOrderId: { type: String, default: null },
    gatewayPaymentId: { type: String, default: null },
    /**
     * When an unpaid order gives its stock back.
     *
     * Not a TTL index: the document must survive so the shopper can still see
     * what they nearly bought and the shop can see what it nearly sold. The
     * sweeper reads this field, releases the stock and marks the order failed.
     */
    expiresAt: { type: Date, default: null },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    _id: { type: String, required: true },
    /** Short human reference — what a shopper reads out to support. */
    reference: { type: String, required: true, unique: true },
    customerId: { type: String, default: null, index: true },
    /** Guests check out with an email and no account. */
    email: { type: String, required: true, lowercase: true, index: true },
    status: { type: String, required: true, default: 'pending', index: true },
    lines: { type: [orderLineSchema], required: true },
    totals: { type: totalsSchema, required: true },
    couponCode: { type: String, default: null },
    shippingAddress: { type: addressSchema, required: true },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, required: true, default: 'pending', index: true },
    payment: { type: orderPaymentSchema, required: true, default: () => ({}) },
    /**
     * When the reserved stock went back on sale. Null while it is still held.
     *
     * The releasing update matches on this being null, so whichever caller gets
     * there first does the work and the rest find nothing to do. That is the
     * whole guard against a cancel and a sweep both crediting the same units.
     */
    stockReleasedAt: { type: Date, default: null },
    trackingNumber: { type: String, default: null },
    estimatedDelivery: { type: Date, default: null },
    placedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: 'orders', _id: false },
);

// The account page's only query: this shopper's orders, newest first.
orderSchema.index({ customerId: 1, placedAt: -1 });
// "Has this shopper actually bought this?" — the verified-purchase check.
orderSchema.index({ email: 1, 'lines.productId': 1 });
// The sweeper's only query: unpaid orders whose window has closed.
orderSchema.index({ paymentStatus: 1, 'payment.expiresAt': 1 });
// Reconciling a gateway callback back to the order that started it.
orderSchema.index({ 'payment.gatewayOrderId': 1 }, { sparse: true });

export type OrderDoc = InferSchemaType<typeof orderSchema>;
export const OrderModel = model('Order', orderSchema);
