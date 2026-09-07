import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * Permissions are strings, checked individually.
 *
 * Not a single `role: 'admin' | 'editor'` enum: real shops need a merchandiser
 * who can edit collections but must not touch pricing, and a warehouse user who
 * updates stock and nothing else. An enum forces every such request to become a
 * new role in code; a permission list makes it a checkbox.
 */
export const PERMISSIONS = [
  'catalog.view',
  'catalog.manage',
  'category.manage',
  'taxonomy.manage',
  'media.manage',
  'inventory.manage',
  'order.view',
  'order.manage',
  /**
   * Confirming that money has actually arrived.
   *
   * Separate from `order.manage` for the same reason `data.export` is separate
   * from `customer.view`: editing a tracking number and declaring a ₹40,000
   * transfer received are different acts with different consequences. Marking
   * an unpaid order paid ships goods for nothing and books revenue that does
   * not exist, and it is the one thing in this panel that cannot be undone by
   * editing a field back.
   */
  'payment.verify',
  'customer.view',
  'promotion.manage',
  'review.moderate',
  'settings.manage',
  'staff.manage',
  /** Content pages and the journal. A merchandiser writes; an owner configures. */
  'cms.manage',
  /**
   * Bulk export is its OWN permission, deliberately separate from `*.view`.
   *
   * Reading customers one at a time to answer a support ticket and downloading
   * every customer's email, phone and lifetime value in one file are different
   * acts with different risk. Support staff need the first and almost never the
   * second, so viewing must not silently grant exporting.
   */
  'data.export',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Presets the admin offers when creating a user. Data, not branching. */
export const ROLE_PRESETS: Record<string, readonly Permission[]> = {
  owner: PERMISSIONS,
  merchandiser: [
    'catalog.view',
    'catalog.manage',
    'category.manage',
    'taxonomy.manage',
    'media.manage',
    'review.moderate',
    'cms.manage',
  ],
  operations: [
    'catalog.view',
    'inventory.manage',
    'order.view',
    'order.manage',
    'payment.verify',
    'customer.view',
  ],
  support: ['catalog.view', 'order.view', 'customer.view', 'review.moderate'],
  // `owner` gets `data.export` through the full list above; the other presets
  // do not, and it is granted per person rather than baked into a role.
  analyst: ['catalog.view', 'order.view', 'customer.view', 'data.export'],
};

const staffSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, default: 'support' },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'staff_users', _id: false },
);

export type StaffDoc = InferSchemaType<typeof staffSchema>;
export const StaffModel = model('StaffUser', staffSchema);
