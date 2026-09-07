import { formatMoney, type OrderView } from '@shop/shared';

import type { StoreSettings } from '../settings/settings.service';

export interface RenderedEmail {
  subject: string;
  body: string;
}

const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value);

const line = (label: string, value: string) => `${label.padEnd(22)}${value}`;

/**
 * Plain text, not HTML.
 *
 * A demo that generated HTML would be generating something nobody can verify —
 * it never reaches a mail client, so the markup would rot unnoticed. Plain text
 * is readable in the admin's outbox, which is where these actually get looked
 * at, and a real provider template would replace this wholesale anyway.
 */
const orderSummary = (order: OrderView, settings: StoreSettings): string => {
  const items = order.lines
    .map(
      (item) =>
        `  ${item.quantity} × ${item.name} — ${item.size.toUpperCase()} / ${item.colourLabel}` +
        `\n      ${money(item.lineTotal)}`,
    )
    .join('\n');

  const address = order.shippingAddress;

  return [
    items,
    '',
    line('Bag total (MRP)', money(order.totals.mrpTotal)),
    order.totals.savings.amount > 0 ? line('Discount', `− ${money(order.totals.savings)}`) : null,
    order.totals.couponDiscount.amount > 0
      ? line(`Coupon ${order.couponCode ?? ''}`.trim(), `− ${money(order.totals.couponDiscount)}`)
      : null,
    line('Delivery', order.totals.shipping.amount === 0 ? 'Free' : money(order.totals.shipping)),
    line('Total', money(order.totals.grandTotal)),
    line('Includes GST', money(order.totals.taxIncluded)),
    '',
    'Delivering to',
    `  ${address.fullName}`,
    `  ${address.line1}`,
    address.line2 ? `  ${address.line2}` : null,
    `  ${address.city}, ${address.state} ${address.postalCode}`,
    `  ${address.phone}`,
    '',
    settings.supportEmail ? `Questions? Reply to ${settings.supportEmail}.` : null,
    `— ${settings.storeName}`,
  ]
    .filter((entry) => entry !== null)
    .join('\n');
};

export const orderConfirmed = (order: OrderView, settings: StoreSettings): RenderedEmail => ({
  subject: `${settings.storeName} — order ${order.reference} confirmed`,
  body: [
    `Hi ${order.shippingAddress.fullName.split(' ')[0]},`,
    '',
    `Thanks — we have your order ${order.reference}.`,
    order.paymentStatus === 'paid'
      ? 'Payment received.'
      : `You will pay ${money(order.totals.grandTotal)} when it arrives.`,
    order.estimatedDelivery
      ? `Arriving by ${new Date(order.estimatedDelivery).toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}.`
      : null,
    '',
    orderSummary(order, settings),
  ]
    .filter((entry) => entry !== null)
    .join('\n'),
});

/**
 * One template per status, because the useful sentence is different each time.
 *
 * A single "your order status changed to X" email is the kind of thing that gets
 * built once and then ignored by every customer who receives it.
 */
const STATUS_COPY: Record<string, (order: OrderView) => { subject: string; opening: string }> = {
  packed: (order) => ({
    subject: `Order ${order.reference} is packed`,
    opening: 'Your order is packed and waiting for the courier.',
  }),
  shipped: (order) => ({
    subject: `Order ${order.reference} is on its way`,
    opening: order.trackingNumber
      ? `Your order has shipped. Tracking number: ${order.trackingNumber}.`
      : 'Your order has shipped.',
  }),
  delivered: (order) => ({
    subject: `Order ${order.reference} delivered`,
    opening: 'Your order has been delivered. We hope it fits beautifully.',
  }),
  cancelled: (order) => ({
    subject: `Order ${order.reference} cancelled`,
    opening: 'Your order has been cancelled. Any payment taken will be refunded.',
  }),
  returned: (order) => ({
    subject: `Return received for ${order.reference}`,
    opening: 'We have received your return and the refund is on its way.',
  }),
};

export const orderStatusChanged = (
  order: OrderView,
  settings: StoreSettings,
): RenderedEmail | null => {
  const copy = STATUS_COPY[order.status]?.(order);

  // `pending` and `confirmed` are covered by the confirmation email; sending a
  // second message the moment an order is confirmed is noise.
  if (!copy) return null;

  return {
    subject: `${settings.storeName} — ${copy.subject}`,
    body: [
      `Hi ${order.shippingAddress.fullName.split(' ')[0]},`,
      '',
      copy.opening,
      '',
      orderSummary(order, settings),
    ].join('\n'),
  };
};

export const welcome = (name: string, settings: StoreSettings): RenderedEmail => ({
  subject: `Welcome to ${settings.storeName}`,
  body: [
    `Hi ${name},`,
    '',
    `Your account is ready. Your bag and wishlist now follow you between devices,`,
    'and every order you place will show up under Your account.',
    '',
    settings.promoBar ? settings.promoBar : null,
    '',
    `— ${settings.storeName}`,
  ]
    .filter((entry) => entry !== null)
    .join('\n'),
});

export const passwordReset = (input: {
  name: string;
  link: string;
  minutes: number;
  storeName: string;
}): RenderedEmail => ({
  subject: `${input.storeName} — reset your password`,
  body: [
    `Hi ${input.name},`,
    '',
    'Someone asked to reset the password on this account. If that was you, open',
    'the link below. If it was not, you can ignore this — nothing has changed.',
    '',
    input.link,
    '',
    `The link works once and expires in ${input.minutes} minutes.`,
    '',
    `— ${input.storeName}`,
  ].join('\n'),
});
