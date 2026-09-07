import {
  formatMoney,
  type ClaimPaymentRequest,
  type GatewayCheckoutHandoff,
  type ManualPaymentInstructions,
  type Money,
  type OrderStatus,
  type OrderView,
  type PaymentStatus,
} from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { env } from '../../config/env';
import { buildManualInstructions, normaliseClaimReference } from '../../lib/payments/manual';
import {
  paymentAcceptability,
  paymentDeadline,
  requireAcceptsPayment,
} from '../../lib/payments/policy';
import {
  createGatewayOrder,
  fetchGatewayPayment,
  verifyCheckoutSignature,
} from '../../lib/payments/razorpay';
import { OrderModel, type OrderDoc } from '../../models/order.model';
import { getSettings } from '../settings/settings.service';
import { notifyStaff } from '../notification/notification.service';
import { toOrderView } from '../order/order.view';
import { releaseOrderStock } from '../order/stock.service';

/**
 * What happens to an order between "placed" and "paid".
 *
 * Two routes reach the same destination — a shopper transferring money that a
 * human confirms, and a gateway confirming it itself — and both funnel through
 * `settlePayment` below so that the rules about what may be paid, and the side
 * effects of being paid, exist exactly once.
 */

/* ------------------------------ shared core ------------------------------ */

/**
 * Marks an order paid, or refuses, for every caller.
 *
 * Idempotent on purpose. A webhook that Razorpay retries, a merchant who
 * double-taps Verify and a shopper who reloads the confirmation page all arrive
 * here, and only the first may take effect. The second is not an error — it is
 * the same truth arriving twice — so it returns the order rather than throwing.
 */
const settlePayment = async (params: {
  order: OrderDoc;
  verifiedBy: string | null;
  gatewayPaymentId?: string;
  reference?: string;
}): Promise<OrderDoc> => {
  const { order, verifiedBy } = params;

  const verdict = paymentAcceptability(
    order.status as OrderStatus,
    order.paymentStatus as PaymentStatus,
  );

  if (!verdict.ok) {
    // Already settled is a no-op, not a failure. Anything else is a real refusal.
    if (verdict.alreadySettled) return order;
    throw ApiError.unprocessable(verdict.reason);
  }

  const now = new Date();

  /**
   * The guard is in the filter, not in an `if` above the update.
   *
   * Two webhook retries arriving together both read `awaiting_payment` and both
   * pass a read-then-check. Matching on the status inside the query means the
   * second update finds nothing, and the shop confirms one payment rather than
   * two.
   */
  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $nin: ['paid', 'refunded'] } },
    {
      $set: {
        paymentStatus: 'paid',
        // An unpaid order is not confirmed. Paying it is what confirms it —
        // unless it has already moved further along, which a late webhook must
        // never wind back.
        ...(order.status === 'pending' ? { status: 'confirmed' } : {}),
        'payment.verifiedAt': now,
        'payment.verifiedBy': verifiedBy,
        'payment.rejectionReason': null,
        'payment.expiresAt': null,
        ...(params.gatewayPaymentId
          ? { 'payment.gatewayPaymentId': params.gatewayPaymentId }
          : {}),
        ...(params.reference ? { 'payment.reference': params.reference } : {}),
      },
    },
    { new: true },
  ).lean();

  // Lost the race: another caller settled it microseconds ago. That is success.
  if (!updated) {
    const current = await OrderModel.findById(order._id).lean();
    return (current ?? order) as OrderDoc;
  }

  const settled = updated as OrderDoc;

  void notifyStaff({
    type: 'payment.received',
    title: `Payment received for ${settled.reference}`,
    body: `${formatMoney(settled.totals.grandTotal as Money)} · ${settled.paymentMethod}${
      verifiedBy ? ` · confirmed by ${verifiedBy}` : ''
    }`,
    href: `/orders?search=${settled.reference}`,
    permission: 'order.view',
    relatedId: settled._id,
  });

  return settled;
};

/* --------------------------- placing the order --------------------------- */

/**
 * Builds what the shopper must do next, immediately after an order is written.
 *
 * Called by checkout. Returns the manual instructions, the gateway handoff, or
 * neither for cash on delivery — exactly one of them, decided by the provider
 * the order was placed under rather than by re-reading settings, so a switch
 * flipped mid-checkout cannot strand an order between two answers.
 */
export const buildPaymentHandoff = async (
  order: OrderDoc,
): Promise<{
  manual: ManualPaymentInstructions | null;
  gateway: GatewayCheckoutHandoff | null;
}> => {
  const provider = order.payment.provider;

  if (provider === 'manual') {
    const settings = await getSettings();
    return {
      manual: await buildManualInstructions({
        settings,
        amount: order.totals.grandTotal as Money,
        reference: order.reference,
        expiresAt: order.payment.expiresAt ?? null,
      }),
      gateway: null,
    };
  }

  if (provider === 'razorpay') {
    const settings = await getSettings();
    const gatewayOrder = await createGatewayOrder({
      amount: order.totals.grandTotal as Money,
      receipt: order.reference,
      notes: { orderId: order._id, reference: order.reference },
    });

    /**
     * The gateway order id is stored BEFORE the browser is handed it.
     *
     * It is the only thing that later binds a signed callback to this order,
     * and a callback that arrives for an id we never recorded has to be
     * rejected. Handing it out first and saving it after leaves a window in
     * which a real payment cannot be matched to anything.
     */
    await OrderModel.updateOne(
      { _id: order._id },
      { $set: { 'payment.gatewayOrderId': gatewayOrder.id } },
    );

    return {
      manual: null,
      gateway: {
        provider: 'razorpay',
        keyId: env.RAZORPAY_KEY_ID,
        gatewayOrderId: gatewayOrder.id,
        amount: order.totals.grandTotal as Money,
        orderReference: order.reference,
        storeName: settings.storeName,
        email: order.email,
        phone: order.shippingAddress.phone,
      },
    };
  }

  return { manual: null, gateway: null };
};

/** The deadline an unpaid order is written with. Cash on delivery has none. */
export const deadlineFor = (provider: string): Date | null =>
  provider === 'none' ? null : paymentDeadline();

/**
 * The payment status an order is born with.
 *
 * Cash on delivery is `pending` — nothing is owed until the courier arrives, and
 * the order ships regardless. Everything else is `awaiting_payment`: money is
 * owed now, and until it arrives the goods must not be packed.
 */
export const initialPaymentStatus = (provider: string): PaymentStatus =>
  provider === 'none' ? 'pending' : 'awaiting_payment';

/* ---------------------------- manual transfers --------------------------- */

/**
 * The shopper says they have transferred the money.
 *
 * This does NOT mark the order paid, and the naming keeps that visible: it is a
 * claim, and the only evidence is a bank statement the shop has to look at. A
 * shop that trusted this field would ship goods to anyone willing to type
 * twelve digits.
 */
export const claimManualPayment = async (params: {
  order: OrderDoc;
  body: ClaimPaymentRequest;
}): Promise<OrderView> => {
  const { order } = params;

  if (order.payment.provider !== 'manual') {
    throw ApiError.unprocessable('This order was not set up for a bank transfer.');
  }

  requireAcceptsPayment(order.status as OrderStatus, order.paymentStatus as PaymentStatus);

  const reference = normaliseClaimReference(params.body.reference);
  if (reference.length < 6) {
    throw ApiError.badRequest('That reference looks too short', {
      reference: 'Enter the UTR or reference number from your banking app',
    });
  }

  const updated = await OrderModel.findByIdAndUpdate(
    order._id,
    {
      $set: {
        paymentStatus: 'verifying',
        'payment.reference': reference,
        'payment.claimedAt': new Date(),
        'payment.rejectionReason': null,
        /**
         * The deadline is cleared once a shopper has said they paid.
         *
         * Sweeping away an order whose money may already be sitting in the
         * account, unread, would cancel a paid order — the single worst outcome
         * available here. A claim that turns out to be false is sent back by a
         * human instead, which restarts the clock.
         */
        'payment.expiresAt': null,
      },
      $inc: { 'payment.claimCount': 1 },
    },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('No such order');
  const view = toOrderView(updated as OrderDoc);

  void notifyStaff({
    type: 'payment.claimed',
    title: `${view.reference} — payment to check`,
    body: `${formatMoney(view.totals.grandTotal)} · reference ${reference}`,
    href: `/payments?search=${view.reference}`,
    severity: 'warning',
    permission: 'order.manage',
    relatedId: view.id,
  });

  return view;
};

/** A human at the shop has found the money on the statement. */
export const verifyManualPayment = async (params: {
  orderId: string;
  staffName: string;
}): Promise<OrderView> => {
  const order = await OrderModel.findById(params.orderId).lean();
  if (!order) throw ApiError.notFound('No such order');

  const settled = await settlePayment({
    order: order as OrderDoc,
    verifiedBy: params.staffName,
  });

  return toOrderView(settled);
};

/**
 * The money was not there. The claim goes back with a reason.
 *
 * The order returns to `awaiting_payment` rather than failing outright: a
 * mistyped UTR is the common case, and killing the order would take a shopper
 * who genuinely paid and make them place it again at a price that may have
 * moved. The stock clock restarts so an abandoned order still frees its goods.
 */
export const rejectManualPayment = async (params: {
  orderId: string;
  reason: string;
  staffName: string;
}): Promise<OrderView> => {
  const order = await OrderModel.findById(params.orderId).lean();
  if (!order) throw ApiError.notFound('No such order');

  const doc = order as OrderDoc;
  requireAcceptsPayment(doc.status as OrderStatus, doc.paymentStatus as PaymentStatus);

  const updated = await OrderModel.findByIdAndUpdate(
    params.orderId,
    {
      $set: {
        paymentStatus: 'awaiting_payment',
        'payment.rejectionReason': params.reason,
        'payment.expiresAt': paymentDeadline(),
        'payment.verifiedBy': null,
      },
    },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('No such order');
  return toOrderView(updated as OrderDoc);
};

/* --------------------------------- gateway -------------------------------- */

/**
 * Verifies the handoff the browser returns when a Razorpay checkout succeeds.
 *
 * Three things are checked, and dropping any one of them is a way to be robbed:
 * the signature is genuine, it was issued for THIS order, and the amount the
 * gateway captured is the amount the server computed. The browser is the least
 * trustworthy party in this exchange and is treated as such.
 */
export const verifyGatewayPayment = async (params: {
  order: OrderDoc;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<OrderView> => {
  const { order } = params;

  if (order.payment.provider !== 'razorpay' || !order.payment.gatewayOrderId) {
    throw ApiError.unprocessable('This order was not set up for a gateway payment.');
  }

  const signatureValid = verifyCheckoutSignature({
    razorpayOrderId: params.razorpayOrderId,
    razorpayPaymentId: params.razorpayPaymentId,
    razorpaySignature: params.razorpaySignature,
    expectedOrderId: order.payment.gatewayOrderId,
  });

  if (!signatureValid) {
    console.error(
      `[payment] rejected signature for ${order.reference}: ` +
        `claimed ${params.razorpayOrderId}, expected ${order.payment.gatewayOrderId}`,
    );
    throw ApiError.unprocessable('We could not verify that payment.');
  }

  /**
   * The gateway is asked what it actually captured.
   *
   * A signature proves the values were issued by Razorpay; it does not prove
   * the payment succeeded or that it was for the full amount. A partial capture
   * with a valid signature would otherwise mark the order paid.
   */
  const payment = await fetchGatewayPayment(params.razorpayPaymentId);

  if (payment.order_id !== order.payment.gatewayOrderId) {
    throw ApiError.unprocessable('That payment belongs to a different order.');
  }

  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    throw ApiError.unprocessable(`The gateway reports this payment as ${payment.status}.`);
  }

  const expected = order.totals.grandTotal as Money;
  if (payment.amount !== expected.amount || payment.currency.toUpperCase() !== expected.currency) {
    console.error(
      `[payment] amount mismatch on ${order.reference}: ` +
        `gateway ${payment.amount} ${payment.currency}, order ${expected.amount} ${expected.currency}`,
    );
    throw ApiError.unprocessable('The amount paid does not match this order.');
  }

  const settled = await settlePayment({
    order,
    verifiedBy: null,
    gatewayPaymentId: payment.id,
    reference: payment.id,
  });

  return toOrderView(settled);
};

/**
 * The webhook: the gateway telling us directly, without a browser in the way.
 *
 * This is the authoritative path. A shopper who pays and immediately closes the
 * tab never returns the handoff, and without this their money is taken and
 * their order sits unconfirmed. The signature is verified by the caller against
 * the raw body before anything here runs.
 */
export const applyGatewayWebhook = async (event: {
  event: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } };
}): Promise<void> => {
  const entity = event.payload?.payment?.entity;
  if (!entity?.order_id || !entity.id) return;

  const order = await OrderModel.findOne({ 'payment.gatewayOrderId': entity.order_id }).lean();
  if (!order) {
    console.warn(`[payment] webhook for unknown gateway order ${entity.order_id}`);
    return;
  }

  const doc = order as OrderDoc;

  if (event.event === 'payment.captured') {
    const expected = doc.totals.grandTotal as Money;
    if (entity.amount !== expected.amount) {
      console.error(
        `[payment] webhook amount mismatch on ${doc.reference}: ` +
          `${entity.amount} vs ${expected.amount}`,
      );
      return;
    }

    await settlePayment({
      order: doc,
      verifiedBy: null,
      gatewayPaymentId: entity.id,
      reference: entity.id,
    });
    return;
  }

  if (event.event === 'payment.failed') {
    await OrderModel.updateOne(
      { _id: doc._id, paymentStatus: { $nin: ['paid', 'refunded'] } },
      { $set: { 'payment.rejectionReason': 'The gateway declined this payment.' } },
    );

    void notifyStaff({
      type: 'payment.failed',
      title: `Payment failed for ${doc.reference}`,
      body: 'The shopper can try again until the order expires.',
      href: `/payments?search=${doc.reference}`,
      severity: 'warning',
      permission: 'order.view',
      relatedId: doc._id,
    });
  }
};

/* -------------------------------- expiry --------------------------------- */

/**
 * Returns the stock held by orders nobody paid for.
 *
 * Stock is reserved when the order is written, so an abandoned transfer takes a
 * garment off sale indefinitely — and the sizes people abandon are the sizes
 * that were nearly sold out. Run on an interval rather than as a TTL index
 * because the document must survive: the shop needs to see what it nearly sold.
 */
export const sweepExpiredPayments = async (): Promise<number> => {
  const due = await OrderModel.find({
    paymentStatus: 'awaiting_payment',
    'payment.expiresAt': { $ne: null, $lte: new Date() },
  })
    .limit(100)
    .lean();

  let swept = 0;

  for (const order of due as OrderDoc[]) {
    /**
     * The status guard is inside the filter again.
     *
     * A shopper claiming payment in the same second as the sweep would
     * otherwise have their order cancelled after they had sent the money.
     */
    const claimed = await OrderModel.findOneAndUpdate(
      { _id: order._id, paymentStatus: 'awaiting_payment' },
      {
        $set: {
          paymentStatus: 'failed',
          status: 'cancelled',
          'payment.expiresAt': null,
          'payment.rejectionReason': 'No payment was received in time.',
        },
      },
    ).lean();

    if (!claimed) continue;

    /**
     * Through the shared release, not a loop of its own.
     *
     * This used to credit the variants inline, which was correct on its own and
     * wrong beside the admin cancel added since — a sweep and a cancel landing
     * together would each return the same units. The release is guarded on the
     * order, so whichever arrives second finds the work already done.
     */
    await releaseOrderStock(order, 'expired');

    swept += 1;
  }

  return swept;
};
