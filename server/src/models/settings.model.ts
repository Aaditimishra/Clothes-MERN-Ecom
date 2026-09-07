import { model, Schema, type InferSchemaType } from 'mongoose';

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'INR', uppercase: true },
  },
  { _id: false },
);

/**
 * Declared as named sub-schemas rather than inline object literals.
 *
 * An inline `[{ rate: Number }]` makes Mongoose infer a `DocumentArray`, whose
 * type stops matching what `lean()` returns — the reads then need casts that
 * hide real mistakes. A named schema infers cleanly on both sides.
 */
const taxBandSchema = new Schema(
  {
    rate: { type: Number, required: true },
    minUnitAmount: { type: Number, required: true },
    maxUnitAmount: { type: Number, default: null },
    label: { type: String, default: '' },
  },
  { _id: false },
);

const promiseSchema = new Schema(
  {
    title: { type: String, required: true },
    copy: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * Store settings — one document, always.
 *
 * `_id` is the literal string `store`, so there is exactly one row and no code
 * anywhere has to decide which settings document is the real one. Reads use
 * `findById('store')`, writes use an upsert.
 *
 * What lives here is everything a merchant should be able to change without a
 * developer: the free-delivery threshold, the COD fee, the GST bands, the
 * palette, the copy in the promo bar.
 */
const settingsSchema = new Schema(
  {
    _id: { type: String, required: true, default: 'store' },

    storeName: { type: String, required: true, default: 'Threadline' },
    tagline: { type: String, default: 'Considered clothing' },
    /** The strip above the header. Empty string hides it entirely. */
    promoBar: { type: String, default: '' },
    supportEmail: { type: String, default: null },
    supportPhone: { type: String, default: null },

    currency: { type: String, required: true, default: 'INR' },
    locale: { type: String, required: true, default: 'en-IN' },

    shipping: {
      freeAbove: { type: moneySchema, required: true },
      standard: { type: moneySchema, required: true },
      codSurcharge: { type: moneySchema, required: true },
      /** Days added to "arriving by" on the confirmation. */
      deliveryDays: { type: Number, default: 5 },
    },

    /**
     * GST bands, ordered by `minUnitAmount`.
     *
     * Data rather than an `if` because apparel is banded and the boundary moves
     * with policy. Editing a rate here changes every subsequent invoice; it does
     * not rewrite history, because orders snapshot their own totals.
     */
    taxBands: { type: [taxBandSchema], default: [] },

    /**
     * The storefront palette, applied as CSS custom properties at runtime.
     *
     * Every colour the shop paints resolves to one of these, which is what makes
     * rebranding a settings change rather than a stylesheet edit. Named for what
     * a merchant sees ("Surface", "Text muted") rather than for the token they
     * happen to drive.
     *
     * These describe the LIGHT palette. Dark mode keeps its own neutrals and
     * borrows only the accent — a merchant-chosen cream surface would make the
     * dark theme unreadable, and asking them to pick two full palettes to change
     * one colour is worse than the constraint.
     */
    branding: {
      primary: { type: String, default: '#12100e' },
      primaryContrast: { type: String, default: '#ffffff' },
      accent: { type: String, default: '#8f3d2f' },
      accentInk: { type: String, default: '#ffffff' },
      accentSoft: { type: String, default: '#f6e9e4' },
      surface: { type: String, default: '#ffffff' },
      surfaceMuted: { type: String, default: '#faf8f5' },
      surfaceSunken: { type: String, default: '#f2eee8' },
      text: { type: String, default: '#12100e' },
      textMuted: { type: String, default: '#6f6862' },
      border: { type: String, default: '#e6e0d8' },
      success: { type: String, default: '#2f6b45' },
      warning: { type: String, default: '#8a5a12' },
      danger: { type: String, default: '#a3231f' },

      fontBody: { type: String, default: "'Inter', system-ui, sans-serif" },
      fontDisplay: { type: String, default: "'Fraunces', Georgia, serif" },
      radius: { type: String, default: '8px' },

      logoMediaId: { type: String, default: null },
      heroMediaId: { type: String, default: null },
      heroEyebrow: { type: String, default: 'Autumn / Winter' },
      heroTitle: { type: String, default: 'Clothes that earn their place.' },
      heroCopy: { type: String, default: '' },
    },

    /** Who the shop legally is. Appears on invoices and the footer. */
    identity: {
      legalName: { type: String, default: '' },
      gstin: { type: String, default: '' },
      addressLine: { type: String, default: '' },
    },

    /**
     * How the shop gets paid.
     *
     * A UPI id and bank details are what an Indian shop actually needs to accept
     * a transfer, and they belong to the merchant, not the code. No card
     * processor keys live here — those are environment secrets, never database
     * rows an admin session could read.
     */
    payment: {
      upiId: { type: String, default: '' },
      upiName: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
    },

    /** The four promises under the hero. Editable, not hardcoded in JSX. */
    promises: { type: [promiseSchema], default: [] },

    features: {
      wishlist: { type: Boolean, default: true },
      reviews: { type: Boolean, default: true },
      guestCheckout: { type: Boolean, default: true },
      codEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true, collection: 'settings', _id: false },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const SettingsModel = model('Settings', settingsSchema);

export const SETTINGS_ID = 'store';
