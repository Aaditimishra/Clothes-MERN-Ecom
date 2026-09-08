import type { Money, OrderView, SizeChartView } from '@shop/shared';

export interface StaffView {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface Session {
  staff: StaffView;
  catalogue: { permissions: string[]; roles: string[] };
}

/** The one envelope every list endpoint answers with. */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface TaxonomyTerm {
  id: string;
  group: string;
  code: string;
  label: string;
  swatch: string | null;
  position: number;
  isActive: boolean;
  isFilterable: boolean;
}

export interface MediaAsset {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  tags: string[];
  provider: string;
  createdAt: string;
}

export interface AdminImage {
  mediaId: string | null;
  url: string;
  alt: string;
}

export interface AdminColourway {
  code: string;
  label: string;
  swatch: string;
  images: AdminImage[];
}

export interface AdminVariant {
  id: string;
  sku: string;
  size: string;
  colour: string;
  price: Money;
  compareAtPrice: Money | null;
  stockQuantity: number;
  isEnabled: boolean;
}

export interface AdminProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: string;
  brandCode: string;
  status: 'draft' | 'active' | 'archived';
  department: string;
  imageUrl: string | null;
  colourCount: number;
  variantCount: number;
  totalStock: number;
  price: Money | null;
  updatedAt: string;
}

export interface AdminProduct extends AdminProductSummary {
  description: string;
  highlights: string[];
  careInstructions: string | null;
  fabric: string | null;
  fit: string | null;
  sleeveLength: string | null;
  occasion: string | null;
  pattern: string | null;
  neckline: string | null;
  primaryCategoryId: string | null;
  categoryIds: string[];
  sizeChartId: string | null;
  colourways: AdminColourway[];
  variants: AdminVariant[];
  sizes: string[];
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  department: string | null;
  parentId: string | null;
  path: string[];
  position: number;
  imageUrl: string | null;
  isVisible: boolean;
}

export interface AdminCoupon {
  id: string;
  code: string;
  description: string;
  type: 'percentage' | 'fixed';
  percentage: number | null;
  amountOff: Money | null;
  maxDiscount: Money | null;
  minSpend: Money | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
}

export interface AdminReview {
  id: string;
  productId: string;
  productName: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  fitFeedback: string | null;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface AdminCustomer {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  addressCount: number;
  wishlistCount: number;
  createdAt: string;
}

export interface Dashboard {
  windowDays: number;
  timezone: string;
  totals: {
    revenue: Money;
    /** Null when the previous window took nothing — there is no honest ratio. */
    revenueChangePercent: number | null;
    orders: number;
    ordersChangePercent: number | null;
    paidOrders: number;
    averageOrderValue: Money;
    customers: number;
    newCustomers: number;
    refunded: Money;
    awaitingPayment: number;
    toVerify: number;
  };
  /** One entry per day in the window, including the days nothing happened. */
  series: Array<{ date: string; revenue: number; orders: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  topProducts: Array<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    revenue: Money;
  }>;
  lowStock: Array<{
    productId: string;
    name: string;
    size: string;
    colour: string;
    left: number;
  }>;
  recentOrders: OrderView[];
}

export interface Branding {
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

/** The palette keys a merchant edits, in the order the screen shows them. */
export const PALETTE_FIELDS = [
  { key: 'primary', label: 'Primary', hint: 'Buttons, headings, the logo' },
  { key: 'primaryContrast', label: 'Primary text', hint: 'Text on primary buttons' },
  { key: 'accent', label: 'Accent', hint: 'Highlights and the main call to action' },
  { key: 'accentInk', label: 'Accent text', hint: 'Text on the accent colour' },
  { key: 'accentSoft', label: 'Accent tint', hint: 'Backgrounds behind accent text' },
  { key: 'surface', label: 'Surface', hint: 'The page background' },
  { key: 'surfaceMuted', label: 'Surface muted', hint: 'Cards and panels' },
  { key: 'surfaceSunken', label: 'Surface sunken', hint: 'Image placeholders, chips' },
  { key: 'text', label: 'Text', hint: 'Body copy' },
  { key: 'textMuted', label: 'Text muted', hint: 'Secondary copy' },
  { key: 'border', label: 'Border', hint: 'Dividers and input outlines' },
  { key: 'success', label: 'Success', hint: 'Savings, in-stock, confirmations' },
  { key: 'warning', label: 'Warning', hint: 'Low stock' },
  { key: 'danger', label: 'Sale / danger', hint: 'Discount badges, errors' },
] as const satisfies ReadonlyArray<{ key: keyof Branding; label: string; hint: string }>;

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
  taxBands: Array<{
    rate: number;
    minUnitAmount: number;
    maxUnitAmount: number | null;
    label: string;
  }>;
  branding: Branding;
  identity: { legalName: string; gstin: string; addressLine: string };
  payment: {
    upiId: string;
    upiName: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    ifsc: string;
    instructions: string;
  };
  promises: Array<{ title: string; copy: string }>;
  features: {
    wishlist: boolean;
    reviews: boolean;
    guestCheckout: boolean;
    codEnabled: boolean;
    manualPaymentEnabled: boolean;
    gatewayEnabled: boolean;
  };
}

export type { SizeChartView };

export interface PostAdminView {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  coverAlt: string;
  author: string;
  category: string | null;
  readMinutes: number;
  publishedAt: string;
  body: string;
  productSlugs: string[];
  isPublished: boolean;
}

export interface PageAdminView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  blocks: Array<{ type: string; heading: string; body: string }>;
  footerGroup: string | null;
  position: number;
  isPublished: boolean;
}
