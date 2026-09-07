import { useQuery } from '@tanstack/react-query';
import type { Money } from '@shop/shared';

import { request } from './api';

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
  taxBands: Array<{ rate: number; minUnitAmount: number; maxUnitAmount: number | null; label: string }>;
  branding: Branding;
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

interface Bootstrap {
  settings: StoreSettings;
  taxonomy: Record<string, TaxonomyTerm[]>;
  /** Published content pages, grouped by the footer column they belong to. */
  footer: Record<string, Array<{ slug: string; title: string }>>;
}

/**
 * The shop's configuration, fetched once.
 *
 * Everything a merchant can change from the admin — the promo bar, the hero, the
 * delivery threshold, which features are on — arrives here rather than being
 * compiled into the bundle. A five-minute stale time is deliberate: this changes
 * a few times a week, and refetching it on every route change would be a request
 * per page for data that has not moved.
 */
export const useStoreConfig = () =>
  useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => request<Bootstrap>('/storefront/bootstrap'),
    staleTime: 5 * 60 * 1000,
  });

export const useSettings = (): StoreSettings | null => useStoreConfig().data?.settings ?? null;
