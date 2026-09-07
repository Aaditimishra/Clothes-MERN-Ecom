import { createHmac, timingSafeEqual } from 'node:crypto';
import { money, type Money } from '@shop/shared';

import { env } from '../../config/env';
import { ApiError } from '../api-error';

/**
 * Razorpay, spoken to over its REST API rather than through its SDK.
 *
 * Three calls and two HMACs is the whole integration, and writing them out
 * keeps a dependency — with its own transitive tree and release cadence — out
 * of the payment path of a shop that is not yet using it. Node has `fetch` and
 * `crypto`; nothing else is needed.
 *
 * This module is dormant until `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are
 * set. Nothing here runs, and nothing here can fail, in a shop taking manual
 * transfers.
 */

const API = 'https://api.razorpay.com/v1';

const authHeader = (): string =>
  `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;

/**
 * Compares two hex digests without leaking, through timing, how much of the
 * prefix matched.
 *
 * `a === b` on a signature returns as soon as the first byte differs, which is
 * measurable and is exactly how signature-forgery attacks are built.
 */
const digestsMatch = (left: string, right: string): boolean => {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  // timingSafeEqual throws on a length mismatch, which is itself a leak-free
  // answer: signatures of different lengths are simply not equal.
  return a.length === b.length && timingSafeEqual(a, b);
};

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
}

/**
 * Opens an order at the gateway and returns the id the browser checkout needs.
 *
 * The amount comes from the server's own total, never from the request. A
 * client that could name its own amount could buy anything for one rupee.
 */
export const createGatewayOrder = async (params: {
  amount: Money;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<GatewayOrder> => {
  const response = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: params.amount.amount,
      currency: params.amount.currency,
      receipt: params.receipt,
      notes: params.notes ?? {},
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`Razorpay order creation failed (${response.status}): ${detail}`);
    /**
     * Deliberately vague to the shopper and specific in the log.
     *
     * "Your card was declined" would be a guess; the gateway refused to open an
     * order, which the shopper can do nothing about and which the shop needs to
     * see in full.
     */
    throw ApiError.unprocessable(
      'We could not start the payment. Please try again, or choose another method.',
    );
  }

  const body = (await response.json()) as GatewayOrder;
  return body;
};

export interface GatewayPayment {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
}

/** Reads a payment back from the gateway — the authority on what was charged. */
export const fetchGatewayPayment = async (paymentId: string): Promise<GatewayPayment> => {
  const response = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`Razorpay payment lookup failed (${response.status}): ${detail}`);
    throw ApiError.unprocessable('We could not confirm that payment with the gateway.');
  }

  return (await response.json()) as GatewayPayment;
};

/**
 * Verifies the handoff a browser returns after the checkout closes.
 *
 * **The signature alone is not enough, and this is the bug that matters.** A
 * valid signature proves the gateway issued these values for *some* order of
 * this merchant's — it says nothing about *which*. Without also checking that
 * `razorpayOrderId` is the id stored on the order being paid, a shopper can pay
 * ₹50 for one order and replay that payment id, order id and signature against
 * a ₹50,000 order. Every value verifies. The goods ship free.
 *
 * The binding check lives in the caller, which is the only place that knows
 * which order this is; this function refuses to be called without it.
 */
export const verifyCheckoutSignature = (params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  /** The gateway order id recorded on the order being paid. */
  expectedOrderId: string;
}): boolean => {
  if (params.razorpayOrderId !== params.expectedOrderId) return false;

  const expected = sign(
    `${params.razorpayOrderId}|${params.razorpayPaymentId}`,
    env.RAZORPAY_KEY_SECRET,
  );

  return digestsMatch(expected, params.razorpaySignature);
};

/**
 * Verifies a webhook against the RAW request body.
 *
 * It must be the raw bytes, not a re-serialised object: `JSON.stringify` of a
 * parsed body reorders keys and drops whitespace, so the digest stops matching
 * and every webhook is rejected as a forgery.
 */
export const verifyWebhookSignature = (rawBody: Buffer, signature: string): boolean => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  return digestsMatch(
    sign(rawBody.toString('utf8'), env.RAZORPAY_WEBHOOK_SECRET),
    signature,
  );
};

/** Reads the amount off a gateway payment as Money, so callers stay in paise. */
export const gatewayAmount = (payment: GatewayPayment): Money =>
  money(payment.amount, payment.currency.toUpperCase());
