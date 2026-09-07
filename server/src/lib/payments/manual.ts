import QRCode from 'qrcode';
import type { ManualPaymentInstructions, Money } from '@shop/shared';

import type { StoreSettings } from '../../modules/settings/settings.service';

/**
 * Paying a shop that has no gateway: the shopper transfers the money and the
 * shop confirms it against a bank statement.
 *
 * This is not a degraded version of a gateway. It is what the overwhelming
 * majority of small Indian retail actually runs on, and the parts that make it
 * work are the parts a naive implementation leaves out — an amount the shopper
 * cannot mistype, a reference the merchant can match against a statement, and a
 * deadline after which the stock goes back on sale.
 */

/**
 * `upi://pay?…` — the intent link every Indian UPI app registers.
 *
 * Filling in the amount matters more than it looks. A shopper typing ₹2,499
 * into their own app types ₹2,490 often enough that the shop spends its evening
 * reconciling short payments; a link that carries the amount cannot be mistyped.
 */
const upiLink = (params: {
  vpa: string;
  name: string;
  amount: Money;
  reference: string;
}): string => {
  const query = new URLSearchParams({
    pa: params.vpa,
    pn: params.name,
    // UPI wants rupees with two decimals, not the integer paise we compute in.
    am: (params.amount.amount / 100).toFixed(2),
    cu: params.amount.currency,
    tn: `Order ${params.reference}`,
    // The transaction reference the shopper's app echoes back to their bank,
    // which is what makes a statement line traceable to an order.
    tr: params.reference,
  });

  return `upi://pay?${query.toString()}`;
};

/**
 * Builds what the shopper needs to pay by hand.
 *
 * Built per request and never stored. Bank details change, and an order that
 * reprinted the account number it was placed with would send this month's money
 * to an account the shop closed last month.
 */
export const buildManualInstructions = async (params: {
  settings: StoreSettings;
  amount: Money;
  reference: string;
  expiresAt: Date | null;
}): Promise<ManualPaymentInstructions> => {
  const { settings, amount, reference, expiresAt } = params;
  const { payment, storeName } = settings;

  let upi: ManualPaymentInstructions['upi'] = null;

  if (payment.upiId) {
    const link = upiLink({
      vpa: payment.upiId,
      name: payment.upiName || storeName,
      amount,
      reference,
    });

    upi = {
      id: payment.upiId,
      name: payment.upiName || storeName,
      link,
      /**
       * The same string as a QR, because half of the people who reach this page
       * are on a laptop where a `upi://` link opens nothing. Rendered to a data
       * URI rather than served as a file: it is derived from the order and the
       * settings, so caching it would only create a way for it to go stale.
       */
      qr: await QRCode.toDataURL(link, { margin: 1, width: 320 }),
    };
  }

  const bank =
    payment.accountNumber && payment.ifsc
      ? {
          bankName: payment.bankName,
          accountName: payment.accountName || settings.identity.legalName || storeName,
          accountNumber: payment.accountNumber,
          ifsc: payment.ifsc,
        }
      : null;

  return {
    amount,
    reference,
    upi,
    bank,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
};

/**
 * Normalises what the shopper typed back as proof of transfer.
 *
 * A UTR is 12 digits, an IMPS reference is usually 12, and NEFT gives a longer
 * alphanumeric string — so the shape is not worth policing beyond stripping the
 * spaces people paste in from a banking app. What matters is that something was
 * quoted and that a human checks it, not that it matched a regex.
 */
export const normaliseClaimReference = (value: string): string =>
  value.replace(/\s+/g, '').toUpperCase();
