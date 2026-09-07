import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_STATUSES, SIZES } from '@shop/shared';

import { PERMISSIONS } from '../../models/staff.model';
import { TAXONOMY_GROUPS } from '../../models/taxonomy.model';

/** Minor units everywhere, so a price never crosses the wire as a float. */
const minorAmount = z.coerce.number().int().min(0).max(100_000_000);

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const imageSchema = z.object({
  mediaId: z.string().trim().max(64).nullish().transform((value) => value || null),
  url: z.string().trim().min(1, 'An image needs a URL').max(2000),
  alt: z.string().trim().max(300).optional().default(''),
  kind: z.enum(['image', 'video']).optional().default('image'),
  posterUrl: z.string().trim().max(2000).nullish().transform((value) => value || null),
});

export const colourwaySchema = z.object({
  code: z.string().trim().toLowerCase().min(1),
  // Ten assets per colourway, images and video together.
  images: z.array(imageSchema).max(10),
});

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name').max(160),
  slug: z.string().trim().toLowerCase().max(160).optional(),
  brandCode: z.string().trim().toLowerCase().min(1, 'Choose a brand'),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  description: z.string().trim().max(6000).optional(),
  highlights: z.array(z.string().trim().max(200)).max(12).optional(),
  careInstructions: z.string().trim().max(1000).nullish().transform((v) => v || null),
  department: z.string().trim().toLowerCase().min(1, 'Choose a department'),
  fabric: z.string().trim().toLowerCase().nullish().transform((v) => v || null),
  fit: z.string().trim().toLowerCase().nullish().transform((v) => v || null),
  sleeveLength: z.string().trim().toLowerCase().nullish().transform((v) => v || null),
  occasion: z.string().trim().toLowerCase().nullish().transform((v) => v || null),
  pattern: z.string().trim().toLowerCase().nullish().transform((v) => v || null),
  neckline: z.string().trim().toLowerCase().nullish().transform((v) => v || null),
  primaryCategoryId: z.string().trim().nullish().transform((v) => v || null),
  categoryIds: z.array(z.string().trim()).max(20).optional(),
  sizeChartId: z.string().trim().nullish().transform((v) => v || null),
  colourways: z.array(colourwaySchema).min(1, 'Add at least one colourway').max(12),
  sizes: z.array(z.enum(SIZES)).min(1, 'Choose at least one size'),
  price: minorAmount,
  compareAtPrice: minorAmount.nullish().transform((v) => v ?? null),
  defaultStock: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const variantPatchSchema = z.object({
  price: minorAmount.optional(),
  compareAtPrice: minorAmount.nullish(),
  stockQuantity: z.coerce.number().int().min(0).max(100_000).optional(),
  isEnabled: z.boolean().optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  description: z.string().trim().max(600).nullish().transform((v) => v || null),
  department: z.string().trim().toLowerCase().nullish().transform((v) => v || null),
  parentId: z.string().trim().nullish().transform((v) => v || null),
  position: z.coerce.number().int().min(0).max(9999).optional(),
  imageUrl: z.string().trim().max(2000).nullish().transform((v) => v || null),
  isVisible: z.boolean().optional(),
});

export const taxonomyTermSchema = z.object({
  group: z.enum(TAXONOMY_GROUPS),
  code: z.string().trim().toLowerCase().max(60).optional(),
  label: z.string().trim().min(1, 'Enter a label').max(80),
  swatch: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44')
    .nullish()
    .transform((v) => v || null),
  position: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
});

export const taxonomyPatchSchema = taxonomyTermSchema.omit({ group: true, code: true }).partial();

export const sizeChartSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  description: z.string().trim().max(600).nullish().transform((v) => v || null),
  unit: z.enum(['cm', 'in']).default('cm'),
  columns: z
    .array(
      z.object({
        code: z.string().trim().toLowerCase().min(1).max(40),
        label: z.string().trim().min(1).max(60),
      }),
    )
    .min(1, 'Add at least one measurement column')
    .max(10),
  rows: z
    .array(
      z.object({
        size: z.enum(SIZES),
        values: z.record(z.coerce.number().min(0).max(400)),
      }),
    )
    .min(1, 'Add at least one size row'),
  note: z.string().trim().max(400).nullish().transform((v) => v || null),
});

export const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(3, 'Codes are at least 3 characters').max(40),
    description: z.string().trim().min(1, 'Describe the offer').max(200),
    type: z.enum(['percentage', 'fixed']),
    percentage: z.coerce.number().min(1).max(100).nullish(),
    amountOff: minorAmount.nullish(),
    maxDiscount: minorAmount.nullish(),
    minSpend: minorAmount.nullish(),
    isActive: z.boolean().optional(),
    startsAt: z.coerce.date().nullish(),
    endsAt: z.coerce.date().nullish(),
    usageLimit: z.coerce.number().int().min(1).nullish(),
  })
  // Checked here rather than in the service so the admin form can highlight the
  // field that is actually missing.
  .refine((value) => value.type !== 'percentage' || value.percentage != null, {
    message: 'Enter a percentage',
    path: ['percentage'],
  })
  .refine((value) => value.type !== 'fixed' || value.amountOff != null, {
    message: 'Enter an amount',
    path: ['amountOff'],
  })
  .refine(
    (value) => !value.startsAt || !value.endsAt || value.startsAt < value.endsAt,
    { message: 'The end date must be after the start date', path: ['endsAt'] },
  );

export const orderPatchSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  trackingNumber: z.string().trim().max(80).nullish().transform((v) => v || null),
  /**
   * Put a returned order's goods back on sale.
   *
   * Only meaningful alongside `status: 'returned'`, and absent means no. A worn
   * or damaged garment going straight back on sale is worse than one sitting in
   * a box until somebody looks at it, so this is the merchant saying they have.
   *
   * Cancellations need no such flag: goods that never shipped are by definition
   * still sellable.
   */
  restock: z.boolean().optional(),
});

export const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
  name: z.string().trim().min(1, 'Enter a name').max(120),
  role: z.string().trim().min(1),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
});

export const staffPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.string().trim().min(1).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
  isActive: z.boolean().optional(),
});

const moneyInput = z.object({ amount: minorAmount, currency: z.string().default('INR') });

export const settingsSchema = z.object({
  storeName: z.string().trim().min(1).max(80).optional(),
  tagline: z.string().trim().max(160).optional(),
  promoBar: z.string().trim().max(300).optional(),
  supportEmail: z.string().trim().email().nullish(),
  supportPhone: z.string().trim().max(40).nullish(),
  // Checked against the runtime's own zone database rather than a list we
  // would have to maintain: an unknown zone throws here instead of silently
  // bucketing a year of takings in UTC.
  timezone: z
    .string()
    .trim()
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Enter a valid time zone, e.g. Asia/Kolkata')
    .optional(),
  shipping: z
    .object({
      freeAbove: moneyInput,
      standard: moneyInput,
      codSurcharge: moneyInput,
      deliveryDays: z.coerce.number().int().min(1).max(60),
    })
    .optional(),
  taxBands: z
    .array(
      z.object({
        rate: z.coerce.number().min(0).max(100),
        minUnitAmount: minorAmount,
        maxUnitAmount: minorAmount.nullish(),
        label: z.string().trim().max(80).optional().default(''),
      }),
    )
    .min(1, 'Keep at least one tax band')
    .optional(),
  branding: z
    .object({
      primary: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      primaryContrast: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      accent: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      accentInk: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      accentSoft: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      surface: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      surfaceMuted: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      surfaceSunken: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      text: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      textMuted: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      border: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      success: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      warning: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      danger: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #1f2d44'),
      fontBody: z.string().trim().max(200),
      fontDisplay: z.string().trim().max(200),
      radius: z.string().trim().max(20),
      logoMediaId: z.string().trim().nullish(),
      heroMediaId: z.string().trim().nullish(),
      heroEyebrow: z.string().trim().max(80),
      heroTitle: z.string().trim().max(160),
      heroCopy: z.string().trim().max(400),
    })
    .partial()
    .optional(),
  identity: z
    .object({
      legalName: z.string().trim().max(160),
      // India's GSTIN is a fixed 15-character format. Validated because a wrong
      // one on an invoice is a compliance problem, not a typo.
      gstin: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
        .or(z.literal('')),
      addressLine: z.string().trim().max(300),
    })
    .partial()
    .optional(),
  payment: z
    .object({
      upiId: z
        .string()
        .trim()
        .regex(/^[\w.-]{2,64}@[a-zA-Z]{2,32}$/, 'Enter a UPI id like shop@bank')
        .or(z.literal('')),
      upiName: z.string().trim().max(120),
      bankName: z.string().trim().max(120),
      accountName: z.string().trim().max(120),
      accountNumber: z.string().trim().max(30),
      ifsc: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC')
        .or(z.literal('')),
      instructions: z.string().trim().max(300),
    })
    .partial()
    .optional(),
  promises: z
    .array(z.object({ title: z.string().trim().max(80), copy: z.string().trim().max(160) }))
    .max(6)
    .optional(),
  features: z
    .object({
      wishlist: z.boolean(),
      reviews: z.boolean(),
      guestCheckout: z.boolean(),
      manualPaymentEnabled: z.boolean(),
      gatewayEnabled: z.boolean(),
      codEnabled: z.boolean(),
    })
    .optional(),
});

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
});
