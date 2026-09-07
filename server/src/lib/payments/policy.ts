import {
  SETTLED_PAYMENT_STATUSES,
  STOCK_RELEASED_ORDER_STATUSES,
  type OrderStatus,
  type PaymentMethod,
  type PaymentOptionView,
  type PaymentProvider,
  type PaymentStatus,
} from '@shop/shared';

import { env } from '../../config/env';
import { ApiError } from '../api-error';
import type { StoreSettings } from '../../modules/settings/settings.service';

/**
 * Every rule about who may be charged, in one file.
 *
 * The manual verifier, the gateway callback and the webhook all ask the same
 * questions, and the only way three callers cannot disagree is for there to be
 * one answer. A rule written out at one of three call sites is a rule that will
 * be missed at the fourth.
 */

/** Whether the gateway is genuinely usable: keys present AND the switch on. */
export const gatewayAvailable = (settings: StoreSettings): boolean =>
  env.razorpayConfigured && settings.features.gatewayEnabled === true;

/** Whether the shop can accept a hand-verified transfer: details present AND on. */
export const manualAvailable = (settings: StoreSettings): boolean =>
  settings.features.manualPaymentEnabled === true && hasTransferDetails(settings);

/**
 * A shop with no UPI id and no account number cannot be paid by transfer.
 *
 * Offering the option anyway produces a confirmation page that asks the shopper
 * to send money to nobody, which is worse than not offering it.
 */
export const hasTransferDetails = (settings: StoreSettings): boolean =>
  Boolean(settings.payment.upiId) ||
  Boolean(settings.payment.accountNumber && settings.payment.ifsc);

/**
 * Which provider collects for a given method, or null if it cannot be offered.
 *
 * Card and net banking have no answer without a gateway — there is no way to
 * take a card by hand — so they are absent rather than degraded into something
 * that pretends to work.
 */
export const resolveProvider = (
  method: PaymentMethod,
  settings: StoreSettings,
): PaymentProvider | null => {
  if (method === 'cod') return settings.features.codEnabled ? 'none' : null;

  if (method === 'card' || method === 'netbanking') {
    return gatewayAvailable(settings) ? 'razorpay' : null;
  }

  // A bank transfer is verified by hand even where a gateway exists: it is the
  // fallback for a shopper whose card the gateway declines.
  if (method === 'bank_transfer') return manualAvailable(settings) ? 'manual' : null;

  // UPI goes through the gateway where there is one, and by hand otherwise.
  // The shopper picks the same tile either way.
  if (gatewayAvailable(settings)) return 'razorpay';
  return manualAvailable(settings) ? 'manual' : null;
};

const COPY: Record<PaymentMethod, { title: string; manual: string; gateway: string }> = {
  upi: {
    title: 'UPI',
    manual: 'Pay from any UPI app. We confirm it within a few hours.',
    gateway: 'Pay with any UPI app. Confirmed instantly.',
  },
  bank_transfer: {
    title: 'Bank transfer',
    manual: 'NEFT or IMPS to our account. We confirm it within a few hours.',
    gateway: 'NEFT or IMPS to our account.',
  },
  card: { title: 'Card', manual: '', gateway: 'Credit or debit.' },
  netbanking: { title: 'Net banking', manual: '', gateway: 'All major banks.' },
  cod: {
    title: 'Cash on delivery',
    manual: 'Pay the courier. A handling fee applies.',
    gateway: 'Pay the courier. A handling fee applies.',
  },
};

/**
 * The payment tiles this shop can actually honour, in the order they are shown.
 *
 * Built on the server because the answer depends on settings and on whether
 * keys exist in the environment — which a browser has no way to know, and must
 * not be told. A tile the server would refuse is worse than no tile at all.
 */
export const availablePaymentOptions = (settings: StoreSettings): PaymentOptionView[] => {
  const order: PaymentMethod[] = ['upi', 'card', 'netbanking', 'bank_transfer', 'cod'];

  return order.flatMap((method) => {
    const provider = resolveProvider(method, settings);
    if (!provider) return [];

    const copy = COPY[method];
    return [
      {
        method,
        provider,
        title: copy.title,
        note: provider === 'manual' ? copy.manual : copy.gateway,
      },
    ];
  });
};

/**
 * Refuses a method this shop cannot honour, at the edge of checkout.
 *
 * The storefront only draws offered tiles, but a request is not a form — it is
 * whatever was posted. Trusting the client here is what lets someone check out
 * as `card` against a shop with no gateway and be marked paid for free.
 */
export const requireProvider = (
  method: PaymentMethod,
  settings: StoreSettings,
): PaymentProvider => {
  const provider = resolveProvider(method, settings);
  if (provider) return provider;

  throw ApiError.unprocessable('That payment method is not available', {
    paymentMethod: 'Choose another way to pay',
  });
};

/**
 * The single rule that decides whether money may still be taken for an order.
 *
 * Two things make it a no. An order that has released its stock — cancelled or
 * returned — must never be marked paid: the goods are back on the shelf, and
 * confirming payment sells them a second time and reports the revenue on the
 * dashboard. And an order already settled must not be settled twice, which is
 * what makes a repeated webhook or a double-tapped Verify button harmless.
 */
export const paymentAcceptability = (
  status: OrderStatus,
  paymentStatus: PaymentStatus,
): { ok: true } | { ok: false; alreadySettled: boolean; reason: string } => {
  if ((STOCK_RELEASED_ORDER_STATUSES as readonly string[]).includes(status)) {
    return {
      ok: false,
      alreadySettled: false,
      reason: `This order is ${status} and its stock has gone back on sale. It cannot be marked paid.`,
    };
  }

  if ((SETTLED_PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)) {
    return {
      ok: false,
      alreadySettled: true,
      reason: `This payment is already ${paymentStatus}.`,
    };
  }

  return { ok: true };
};

/** Throws unless the order may still be paid. */
export const requireAcceptsPayment = (
  status: OrderStatus,
  paymentStatus: PaymentStatus,
): void => {
  const verdict = paymentAcceptability(status, paymentStatus);
  if (!verdict.ok) throw ApiError.unprocessable(verdict.reason);
};

/** When an unpaid order should hand its stock back. */
export const paymentDeadline = (from = new Date()): Date =>
  new Date(from.getTime() + env.PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
