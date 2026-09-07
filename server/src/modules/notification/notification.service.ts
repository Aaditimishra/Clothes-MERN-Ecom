import { newId, type OrderView } from '@shop/shared';

import { env } from '../../config/env';
import {
  EmailModel,
  NotificationModel,
  type EmailDoc,
  type NotificationDoc,
  type NotificationType,
} from '../../models/notification.model';
import { getSettings } from '../settings/settings.service';
import {
  orderConfirmed,
  orderStatusChanged,
  passwordReset,
  welcome,
  type RenderedEmail,
} from './email.templates';

/* ------------------------------- delivery -------------------------------- */

export interface EmailDelivery {
  readonly name: string;
  send(message: { to: string; subject: string; body: string }): Promise<void>;
}

/**
 * The default adapter: record it, do not send it.
 *
 * This shop has no mail provider wired in, and pretending otherwise would be
 * worse than being explicit — a merchant who believes confirmations are going
 * out will not notice for weeks. Every message still lands in the outbox with
 * status `recorded`, so the admin can show exactly what would have been sent.
 *
 * Swapping in SES, Postmark or SMTP means implementing this one interface; every
 * caller below already writes the outbox row first and marks the outcome after.
 */
const recordOnlyDelivery: EmailDelivery = {
  name: 'outbox',
  async send() {
    /* nothing leaves the building */
  },
};

let delivery: EmailDelivery = recordOnlyDelivery;

export const useEmailDelivery = (adapter: EmailDelivery): void => {
  delivery = adapter;
};

/* --------------------------------- emails -------------------------------- */

interface QueueInput {
  to: string;
  template: string;
  rendered: RenderedEmail;
  data?: Record<string, unknown>;
  relatedId?: string | null;
}

/**
 * Writes the outbox row, then attempts delivery.
 *
 * That order matters: a provider failure leaves a row marked `failed` with the
 * reason on it, rather than a message that was never recorded at all. Nothing
 * here throws — an order must not fail because an email did.
 */
const queueEmail = async (input: QueueInput): Promise<EmailDoc | null> => {
  try {
    const created = await EmailModel.create({
      _id: newId('eml'),
      to: input.to,
      subject: input.rendered.subject,
      template: input.template,
      body: input.rendered.body,
      data: input.data ?? {},
      status: 'queued',
      relatedId: input.relatedId ?? null,
    });

    try {
      await delivery.send({
        to: input.to,
        subject: input.rendered.subject,
        body: input.rendered.body,
      });

      created.status = delivery === recordOnlyDelivery ? 'recorded' : 'sent';
      created.provider = delivery.name;
      created.sentAt = new Date();
    } catch (error) {
      created.status = 'failed';
      created.provider = delivery.name;
      created.error = error instanceof Error ? error.message : 'unknown error';
    }

    await created.save();

    if (!env.isProduction) {
      console.info(`[email:${created.status}] ${input.to} — ${input.rendered.subject}`);
    }

    return created.toObject();
  } catch (error) {
    console.error('[email] could not queue', error);
    return null;
  }
};

/* ----------------------------- notifications ----------------------------- */

interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  severity?: 'info' | 'warning' | 'critical';
  permission: string;
  relatedId?: string | null;
}

export const notifyStaff = async (input: NotifyInput): Promise<void> => {
  try {
    await NotificationModel.create({
      _id: newId('ntf'),
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      href: input.href ?? null,
      severity: input.severity ?? 'info',
      permission: input.permission,
      relatedId: input.relatedId ?? null,
      readBy: [],
    });
  } catch (error) {
    // A missed notification must never take down the action that caused it.
    console.error('[notify] could not record', error);
  }
};

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  severity: string;
  isRead: boolean;
  createdAt: string;
}

const toView = (doc: NotificationDoc, staffId: string): NotificationView => ({
  id: doc._id,
  type: doc.type,
  title: doc.title,
  body: doc.body ?? '',
  href: doc.href ?? null,
  severity: doc.severity ?? 'info',
  // Read state is per person: one manager clearing the feed must not hide a new
  // order from everyone else on the team.
  isRead: doc.readBy.includes(staffId),
  createdAt: (doc.createdAt ?? new Date()).toISOString(),
});

export const listNotifications = async (
  staff: { id: string; permissions: string[] },
  limit = 30,
): Promise<{ items: NotificationView[]; unread: number }> => {
  const visible = { permission: { $in: staff.permissions } };

  const [docs, unread] = await Promise.all([
    NotificationModel.find(visible).sort({ createdAt: -1, _id: 1 }).limit(limit).lean(),
    NotificationModel.countDocuments({ ...visible, readBy: { $ne: staff.id } }),
  ]);

  return { items: docs.map((doc) => toView(doc, staff.id)), unread };
};

export const markNotificationsRead = async (
  staffId: string,
  ids?: string[],
): Promise<void> => {
  await NotificationModel.updateMany(
    ids && ids.length > 0 ? { _id: { $in: ids } } : { readBy: { $ne: staffId } },
    { $addToSet: { readBy: staffId } },
  );
};

/* ------------------------------- triggers -------------------------------- */

/** Below this many left in a size, the shop wants to know before it sells out. */
const LOW_STOCK_THRESHOLD = 3;

/**
 * The recipient is passed in rather than read off the order.
 *
 * `OrderView` deliberately carries no email — it is the shape sent to the
 * browser, and an order looked up by reference should not hand back the address
 * it belongs to. The caller has it; this function does not need to widen a
 * public contract to get at it.
 */
export const onOrderPlaced = async (
  order: OrderView,
  email: string,
  lowStock: Array<{ name: string; size: string; left: number }>,
): Promise<void> => {
  const settings = await getSettings();

  await queueEmail({
    to: email,
    template: 'order-confirmed',
    rendered: orderConfirmed(order, settings),
    data: { reference: order.reference },
    relatedId: order.id,
  });

  await notifyStaff({
    type: 'order.placed',
    title: `New order ${order.reference}`,
    body:
      `${order.itemCount} item${order.itemCount === 1 ? '' : 's'} · ` +
      `${order.paymentMethod.toUpperCase()} · ${order.shippingAddress.city}`,
    href: `/orders?search=${order.reference}`,
    permission: 'order.view',
    relatedId: order.id,
  });

  for (const entry of lowStock) {
    await notifyStaff({
      type: entry.left === 0 ? 'stock.out' : 'stock.low',
      title:
        entry.left === 0
          ? `${entry.name} (${entry.size.toUpperCase()}) has sold out`
          : `${entry.name} (${entry.size.toUpperCase()}) — ${entry.left} left`,
      body: 'Restock or disable the size so it stops being offered.',
      href: '/products',
      severity: entry.left === 0 ? 'critical' : 'warning',
      permission: 'inventory.manage',
      relatedId: order.id,
    });
  }
};

export const onOrderStatusChanged = async (
  order: OrderView,
  email: string,
): Promise<void> => {
  const settings = await getSettings();
  const rendered = orderStatusChanged(order, settings);

  if (rendered) {
    await queueEmail({
      to: email,
      template: `order-${order.status}`,
      rendered,
      data: { reference: order.reference, status: order.status },
      relatedId: order.id,
    });
  }

  if (order.status === 'cancelled') {
    await notifyStaff({
      type: 'order.cancelled',
      title: `Order ${order.reference} cancelled`,
      href: `/orders?search=${order.reference}`,
      severity: 'warning',
      permission: 'order.view',
      relatedId: order.id,
    });
  }
};

export const onCustomerRegistered = async (customer: {
  id: string;
  email: string;
  firstName: string;
}): Promise<void> => {
  const settings = await getSettings();

  await queueEmail({
    to: customer.email,
    template: 'welcome',
    rendered: welcome(customer.firstName, settings),
    relatedId: customer.id,
  });

  await notifyStaff({
    type: 'customer.registered',
    title: `${customer.firstName} created an account`,
    body: customer.email,
    href: `/customers?search=${customer.email}`,
    permission: 'customer.view',
    relatedId: customer.id,
  });
};

export const queuePasswordReset = async (input: {
  to: string;
  name: string;
  link: string;
  minutes: number;
  subjectId: string;
}): Promise<void> => {
  const settings = await getSettings();

  await queueEmail({
    to: input.to,
    template: 'password-reset',
    rendered: passwordReset({ ...input, storeName: settings.storeName }),
    // The link is deliberately NOT stored in `data`. The outbox is readable by
    // any staff member with settings access, and a reset link is a credential —
    // it belongs in the recipient's inbox and nowhere else.
    data: { requestedAt: new Date().toISOString() },
    relatedId: input.subjectId,
  });
};

export const onReviewPosted = async (input: {
  productName: string;
  rating: number;
  author: string;
  productId: string;
}): Promise<void> => {
  await notifyStaff({
    type: 'review.posted',
    title: `${input.rating}★ review on ${input.productName}`,
    body: `by ${input.author}`,
    href: '/reviews',
    // A one- or two-star review is something a shop wants to see today, not in
    // next week's report.
    severity: input.rating <= 2 ? 'warning' : 'info',
    permission: 'review.moderate',
    relatedId: input.productId,
  });
};

export const lowStockThreshold = LOW_STOCK_THRESHOLD;

export interface EmailListItem {
  id: string;
  to: string;
  subject: string;
  template: string;
  body: string;
  status: string;
  provider: string | null;
  error: string | null;
  createdAt: string;
}

export const listEmails = async (params: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{ items: EmailListItem[]; total: number; page: number; pageCount: number }> => {
  const filter = params.search
    ? {
        $or: [
          { to: { $regex: params.search, $options: 'i' } },
          { subject: { $regex: params.search, $options: 'i' } },
        ],
      }
    : {};

  const [docs, total] = await Promise.all([
    EmailModel.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip((params.page - 1) * params.pageSize)
      .limit(params.pageSize)
      .lean(),
    EmailModel.countDocuments(filter),
  ]);

  return {
    items: docs.map((doc) => ({
      id: doc._id,
      to: doc.to,
      subject: doc.subject,
      template: doc.template,
      body: doc.body,
      status: doc.status,
      provider: doc.provider ?? null,
      error: doc.error ?? null,
      createdAt: (doc.createdAt ?? new Date()).toISOString(),
    })),
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
  };
};
