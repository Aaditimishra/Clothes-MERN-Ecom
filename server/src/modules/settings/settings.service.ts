import { money, type Money } from '@shop/shared';

import { MediaModel } from '../../models/media.model';
import { SETTINGS_ID, SettingsModel, type SettingsDoc } from '../../models/settings.model';

export interface TaxBand {
  rate: number;
  minUnitAmount: number;
  maxUnitAmount: number | null;
  label: string;
}

/** The palette, plus the two assets and the hero copy that travel with it. */
export interface BrandingView {
  primary: string;
  primaryContrast: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  fontBody: string;
  fontDisplay: string;
  radius: string;
  logoUrl: string | null;
  heroUrl: string | null;
  heroEyebrow: string;
  heroTitle: string;
  heroCopy: string;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  promoBar: string;
  supportEmail: string | null;
  supportPhone: string | null;
  currency: string;
  locale: string;
  shipping: {
    freeAbove: Money;
    standard: Money;
    codSurcharge: Money;
    deliveryDays: number;
  };
  taxBands: TaxBand[];
  branding: BrandingView;
  identity: { legalName: string; gstin: string; addressLine: string };
  payment: {
    upiId: string;
    upiName: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    ifsc: string;
  };
  promises: Array<{ title: string; copy: string }>;
  features: {
    wishlist: boolean;
    reviews: boolean;
    guestCheckout: boolean;
    codEnabled: boolean;
  };
}

/**
 * The values used when the settings document has not been written yet.
 *
 * A shop with an empty database must still serve a page. These are the same
 * numbers the seed writes, so a fresh install and a seeded one behave
 * identically rather than differing in ways nobody notices until production.
 */
export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'Threadline',
  tagline: 'Considered clothing',
  promoBar: 'Free delivery over ₹1,499 · Easy 15-day returns',
  supportEmail: null,
  supportPhone: null,
  currency: 'INR',
  locale: 'en-IN',
  shipping: {
    freeAbove: money(149_900),
    standard: money(9_900),
    codSurcharge: money(4_900),
    deliveryDays: 5,
  },
  taxBands: [
    { rate: 5, minUnitAmount: 0, maxUnitAmount: 100_000, label: 'GST 5% (under ₹1,000)' },
    { rate: 12, minUnitAmount: 100_000, maxUnitAmount: null, label: 'GST 12% (₹1,000 and above)' },
  ],
  branding: {
    primary: '#12100e',
    primaryContrast: '#ffffff',
    accent: '#8f3d2f',
    accentInk: '#ffffff',
    accentSoft: '#f6e9e4',
    surface: '#ffffff',
    surfaceMuted: '#faf8f5',
    surfaceSunken: '#f2eee8',
    text: '#12100e',
    textMuted: '#6f6862',
    border: '#e6e0d8',
    success: '#2f6b45',
    warning: '#8a5a12',
    danger: '#a3231f',
    fontBody: "'Inter', system-ui, sans-serif",
    fontDisplay: "'Fraunces', Georgia, serif",
    radius: '8px',
    logoUrl: null,
    heroUrl: null,
    heroEyebrow: 'Autumn / Winter',
    heroTitle: 'Clothes that earn their place.',
    heroCopy: '',
  },
  identity: { legalName: '', gstin: '', addressLine: '' },
  payment: { upiId: '', upiName: '', bankName: '', accountName: '', accountNumber: '', ifsc: '' },
  promises: [],
  features: { wishlist: true, reviews: true, guestCheckout: true, codEnabled: true },
};

/**
 * Settings are read on every priced request and written rarely.
 *
 * Cached for the same reason the vocabulary is, and invalidated explicitly on
 * save so a merchant changing the free-delivery threshold sees it take effect on
 * their next page load rather than a minute later.
 */
const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: StoreSettings } | null = null;

export const invalidateSettingsCache = (): void => {
  cache = null;
};

/** Drops keys whose value is `undefined` so a spread cannot erase a default. */
const stripUndefined = <T extends Record<string, unknown>>(input: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  ) as Partial<T>;

const toMoney = (
  raw: { amount: number; currency: string } | undefined | null,
  fallback: Money,
): Money => (raw ? { amount: raw.amount, currency: raw.currency } : fallback);

const toSettings = (
  doc: SettingsDoc | null,
  mediaUrls: ReadonlyMap<string, string>,
): StoreSettings => {
  if (!doc) return DEFAULT_SETTINGS;

  const bands = doc.taxBands.map((band) => ({
    rate: band.rate,
    minUnitAmount: band.minUnitAmount,
    maxUnitAmount: band.maxUnitAmount ?? null,
    label: band.label ?? '',
  }));

  return {
    storeName: doc.storeName,
    tagline: doc.tagline ?? '',
    promoBar: doc.promoBar ?? '',
    supportEmail: doc.supportEmail ?? null,
    supportPhone: doc.supportPhone ?? null,
    currency: doc.currency,
    locale: doc.locale,
    shipping: {
      freeAbove: toMoney(doc.shipping?.freeAbove, DEFAULT_SETTINGS.shipping.freeAbove),
      standard: toMoney(doc.shipping?.standard, DEFAULT_SETTINGS.shipping.standard),
      codSurcharge: toMoney(doc.shipping?.codSurcharge, DEFAULT_SETTINGS.shipping.codSurcharge),
      deliveryDays: doc.shipping?.deliveryDays ?? 5,
    },
    // An empty band list would make every item tax-free. Falling back is safer
    // than trusting a document someone emptied by accident.
    taxBands: bands.length > 0 ? bands : DEFAULT_SETTINGS.taxBands,
    branding: {
      // Each colour falls back on its own. A partial branding document — which
      // is what an older row looks like after this schema grew — then renders a
      // complete palette rather than a page of `undefined` custom properties.
      ...DEFAULT_SETTINGS.branding,
      ...stripUndefined({
        primary: doc.branding?.primary,
        primaryContrast: doc.branding?.primaryContrast,
        accent: doc.branding?.accent,
        accentInk: doc.branding?.accentInk,
        accentSoft: doc.branding?.accentSoft,
        surface: doc.branding?.surface,
        surfaceMuted: doc.branding?.surfaceMuted,
        surfaceSunken: doc.branding?.surfaceSunken,
        text: doc.branding?.text,
        textMuted: doc.branding?.textMuted,
        border: doc.branding?.border,
        success: doc.branding?.success,
        warning: doc.branding?.warning,
        danger: doc.branding?.danger,
        fontBody: doc.branding?.fontBody,
        fontDisplay: doc.branding?.fontDisplay,
        radius: doc.branding?.radius,
        heroEyebrow: doc.branding?.heroEyebrow,
        heroTitle: doc.branding?.heroTitle,
        heroCopy: doc.branding?.heroCopy,
      }),
      logoUrl: doc.branding?.logoMediaId
        ? mediaUrls.get(doc.branding.logoMediaId) ?? null
        : null,
      heroUrl: doc.branding?.heroMediaId
        ? mediaUrls.get(doc.branding.heroMediaId) ?? null
        : null,
    },
    identity: {
      legalName: doc.identity?.legalName ?? '',
      gstin: doc.identity?.gstin ?? '',
      addressLine: doc.identity?.addressLine ?? '',
    },
    payment: {
      upiId: doc.payment?.upiId ?? '',
      upiName: doc.payment?.upiName ?? '',
      bankName: doc.payment?.bankName ?? '',
      accountName: doc.payment?.accountName ?? '',
      accountNumber: doc.payment?.accountNumber ?? '',
      ifsc: doc.payment?.ifsc ?? '',
    },
    promises: doc.promises.map((promise) => ({
      title: promise.title ?? '',
      copy: promise.copy ?? '',
    })),
    features: {
      wishlist: doc.features?.wishlist ?? true,
      reviews: doc.features?.reviews ?? true,
      guestCheckout: doc.features?.guestCheckout ?? true,
      codEnabled: doc.features?.codEnabled ?? true,
    },
  };
};

export const getSettings = async (): Promise<StoreSettings> => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const doc = await SettingsModel.findById(SETTINGS_ID).lean();

  // Only the two branding assets need resolving, so this stays a targeted
  // lookup rather than loading the media collection.
  const ids = [doc?.branding?.logoMediaId, doc?.branding?.heroMediaId].filter(
    (id): id is string => Boolean(id),
  );

  const mediaUrls = new Map<string, string>();
  if (ids.length > 0) {
    const assets = await MediaModel.find({ _id: { $in: ids } }).lean();
    for (const asset of assets) mediaUrls.set(asset._id, asset.key);
  }

  const value = toSettings(doc, mediaUrls);
  cache = { at: Date.now(), value };
  return value;
};

/**
 * Flattens `{ branding: { accent } }` into `{ 'branding.accent': … }`.
 *
 * Mongo's `$set` REPLACES a nested object wholesale: saving only the accent
 * colour would wipe every other colour, the fonts and the hero copy along with
 * it. Dot paths update one leaf and leave its siblings alone, which is what a
 * partial save has to mean.
 *
 * Arrays are set whole on purpose — `taxBands` and `promises` are ordered lists
 * where removing the third entry has to actually remove it, not merge onto it.
 */
const toDotPaths = (
  input: Record<string, unknown>,
  prefix = '',
): Record<string, unknown> => {
  const flat: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;

    const path = prefix ? `${prefix}.${key}` : key;
    const isPlainObject =
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date);

    if (isPlainObject) {
      Object.assign(flat, toDotPaths(value as Record<string, unknown>, path));
    } else {
      flat[path] = value;
    }
  }

  return flat;
};

export const saveSettings = async (patch: Record<string, unknown>): Promise<StoreSettings> => {
  const flattened = toDotPaths(patch);

  if (Object.keys(flattened).length > 0) {
    await SettingsModel.updateOne(
      { _id: SETTINGS_ID },
      { $set: flattened },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  invalidateSettingsCache();
  return getSettings();
};
