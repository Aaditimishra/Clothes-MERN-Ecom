import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * An email the shop wanted to send.
 *
 * Written to the database BEFORE any provider is called, which is what makes
 * delivery debuggable: "did the customer get their confirmation?" becomes a
 * lookup rather than a guess, and a provider outage leaves a queue to retry
 * instead of silence.
 *
 * This is an outbox, not a mailbox — it records intent and outcome, never
 * anything the recipient replies with.
 */
const emailSchema = new Schema(
  {
    _id: { type: String, required: true },
    to: { type: String, required: true, lowercase: true, index: true },
    subject: { type: String, required: true },
    /** Which message this is — `order-confirmed`, `order-shipped`, … */
    template: { type: String, required: true, index: true },
    /** Rendered plain text. Kept so support can see exactly what was sent. */
    body: { type: String, required: true },
    /** What the template was rendered from, for re-sending after a fix. */
    data: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, required: true, default: 'queued', index: true },
    provider: { type: String, default: null },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
    /** Links the message back to the order or review that caused it. */
    relatedId: { type: String, default: null, index: true },
  },
  { timestamps: true, collection: 'emails', _id: false },
);

emailSchema.index({ createdAt: -1 });

export type EmailDoc = InferSchemaType<typeof emailSchema>;
export const EmailModel = model('Email', emailSchema);

/**
 * Something the shop's staff should know about.
 *
 * Separate from emails on purpose: an email is addressed to one person and is
 * expected to leave the building; a notification is an internal work item that
 * anyone with the right permission can pick up.
 */
export const NOTIFICATION_TYPES = [
  'order.placed',
  'order.cancelled',
  'stock.low',
  'stock.out',
  'review.posted',
  'customer.registered',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    /** Where in the admin this leads, e.g. `/orders?search=TL-XXXX`. */
    href: { type: String, default: null },
    severity: { type: String, default: 'info' },
    /**
     * Which permission a staff member needs to see it.
     *
     * A support account should not learn that stock is low on a line it cannot
     * restock, and a merchandiser does not need every order notification. The
     * feed is filtered by the same permissions that gate the pages.
     */
    permission: { type: String, required: true, index: true },
    readBy: { type: [String], default: [] },
    relatedId: { type: String, default: null },
  },
  { timestamps: true, collection: 'notifications', _id: false },
);

notificationSchema.index({ createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model('Notification', notificationSchema);
