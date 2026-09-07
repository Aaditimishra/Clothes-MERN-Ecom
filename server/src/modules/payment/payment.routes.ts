import { Router, raw } from 'express';
import { z } from 'zod';

import { ApiError } from '../../lib/api-error';
import { asyncHandler } from '../../lib/async-handler';
import { parseBody, parseQuery } from '../../lib/validate';
import { buildManualInstructions } from '../../lib/payments/manual';
import { verifyWebhookSignature } from '../../lib/payments/razorpay';
import { getSettings } from '../settings/settings.service';
import { requireOwnedOrder } from '../order/order.service';
import { toOrderView } from '../order/order.view';
import {
  applyGatewayWebhook,
  claimManualPayment,
  verifyGatewayPayment,
} from './payment.service';

export const paymentRouter: Router = Router();

const referenceParam = z.string().trim().min(1).max(20);

/**
 * Guests prove ownership with the email they checked out with, exactly as they
 * do to read the order itself. Signed-in shoppers need neither.
 */
const identityQuery = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
});

const identityFrom = (req: {
  customerId?: string | null;
  query: unknown;
}): { customerId: string | null; email: string | null } => {
  const parsed = identityQuery.safeParse(req.query);
  return {
    customerId: req.customerId ?? null,
    email: parsed.success ? (parsed.data.email ?? null) : null,
  };
};

/**
 * The transfer details, fetched again.
 *
 * The confirmation page gets these in the checkout response, but a shopper who
 * reloads, or who opens the order from their email on a different device, has
 * no such response — and telling them to place the order again to see where to
 * send the money would be absurd.
 */
paymentRouter.get(
  '/orders/:reference/payment',
  asyncHandler(async (req, res) => {
    const reference = referenceParam.parse(req.params.reference);
    const order = await requireOwnedOrder(reference, identityFrom(req));

    if (order.payment.provider !== 'manual') {
      res.json({ manual: null });
      return;
    }

    const settings = await getSettings();
    res.json({
      manual: await buildManualInstructions({
        settings,
        amount: order.totals.grandTotal,
        reference: order.reference,
        expiresAt: order.payment.expiresAt ?? null,
      }),
    });
  }),
);

const claimSchema = z.object({
  reference: z.string().trim().min(1, 'Enter the reference from your banking app').max(64),
});

/**
 * "I have sent the money."
 *
 * Moves the order to `verifying` and tells the shop to go and look. It does not
 * mark anything paid — see `claimManualPayment`.
 */
paymentRouter.post(
  '/orders/:reference/payment/claim',
  asyncHandler(async (req, res) => {
    const reference = referenceParam.parse(req.params.reference);
    const { email } = parseQuery(req, identityQuery);

    const order = await requireOwnedOrder(reference, {
      customerId: req.customerId ?? null,
      email: email ?? null,
    });

    res.json(await claimManualPayment({ order, body: parseBody(req, claimSchema) }));
  }),
);

const gatewayVerifySchema = z.object({
  razorpayOrderId: z.string().trim().min(1).max(120),
  razorpayPaymentId: z.string().trim().min(1).max(120),
  razorpaySignature: z.string().trim().min(1).max(256),
});

/**
 * The browser handing back what Razorpay gave it when the checkout closed.
 *
 * Convenience, not authority — the webhook is what the shop actually relies on.
 * This exists so the shopper sees "paid" immediately instead of staring at
 * "awaiting payment" for however long the webhook takes.
 */
paymentRouter.post(
  '/orders/:reference/payment/gateway/verify',
  asyncHandler(async (req, res) => {
    const reference = referenceParam.parse(req.params.reference);
    const { email } = parseQuery(req, identityQuery);

    const order = await requireOwnedOrder(reference, {
      customerId: req.customerId ?? null,
      email: email ?? null,
    });

    res.json(await verifyGatewayPayment({ order, ...parseBody(req, gatewayVerifySchema) }));
  }),
);

/**
 * Re-reads an order after a gateway payment, for the confirmation page to poll.
 *
 * A shopper whose webhook lands before their browser returns should see "paid"
 * rather than a stale "awaiting payment" they will phone the shop about.
 */
paymentRouter.get(
  '/orders/:reference/payment/status',
  asyncHandler(async (req, res) => {
    const reference = referenceParam.parse(req.params.reference);
    const order = await requireOwnedOrder(reference, identityFrom(req));
    const view = toOrderView(order);

    res.json({ paymentStatus: view.paymentStatus, status: view.status, payment: view.payment });
  }),
);

/**
 * The webhook lives on its own router because it needs the RAW body.
 *
 * `express.json` is mounted app-wide and marks a body as parsed, so a later
 * `raw()` on the same request quietly does nothing and hands back the parsed
 * object instead of bytes. The signature is computed over the exact bytes
 * Razorpay sent, so this router is mounted ahead of the JSON parser in
 * `app.ts` — that ordering is load-bearing, not stylistic.
 */
export const paymentWebhookRouter: Router = Router();

/**
 * The gateway telling us directly.
 *
 * Unauthenticated by necessity — Razorpay has no session — so the signature over
 * the raw body IS the authentication. `express.raw` is mounted on this route
 * alone: the JSON parser would leave us with a re-serialised object whose bytes
 * no longer match what was signed, and every genuine webhook would be rejected.
 */
paymentWebhookRouter.post(
  '/razorpay',
  raw({ type: 'application/json', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const signature = req.header('x-razorpay-signature');
    const body = req.body as Buffer;

    if (!signature || !Buffer.isBuffer(body) || !verifyWebhookSignature(body, signature)) {
      throw ApiError.unauthorized('Invalid webhook signature');
    }

    /**
     * Acknowledged before it is applied.
     *
     * Razorpay retries anything that does not answer quickly, and a slow
     * database write would earn a duplicate delivery rather than patience.
     * `settlePayment` is idempotent, so a retry that does arrive is harmless.
     */
    res.status(200).json({ received: true });

    try {
      await applyGatewayWebhook(JSON.parse(body.toString('utf8')));
    } catch (error) {
      console.error('[payment] webhook processing failed', error);
    }
  }),
);
