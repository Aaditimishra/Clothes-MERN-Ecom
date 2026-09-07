import { useQuery } from '@tanstack/react-query';
import type { Money, PaymentOptionView } from '@shop/shared';

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
  /**
   * Only the merchant's instruction copy.
   *
   * The UPI id and bank details deliberately do NOT arrive here. The bootstrap
   * is public, and the shop's account number has no use in the storefront
   * chrome — a shopper holding an unpaid order fetches it from the payment
   * endpoint after proving the order is theirs.
   */
  payment: { instructions: string };
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

interface Bootstrap {
  settings: StoreSettings;
  taxonomy: Record<string, TaxonomyTerm[]>;
  /** Published content pages, grouped by the footer column they belong to. */
  footer: Record<string, Array<{ slug: string; title: string }>>;
  /**
   * The ways to pay this shop can actually honour, in the order to show them.
   *
   * Server-decided. Whether a card can be taken depends on gateway keys living
   * in the API's environment, which a browser has no way to know and must not
   * be told — so the storefront draws what it is given rather than filtering a
   * hardcoded list and hoping the server agrees.
   */
  paymentOptions: PaymentOptionView[];
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

/**
 * The payment tiles to draw at checkout.
 *
 * Empty until the bootstrap lands, and empty is meaningful: a shop with cash on
 * delivery off, no transfer details filled in and no gateway cannot be paid at
 * all, and the checkout says so rather than showing a payment step with nothing
 * in it.
 */
export const usePaymentOptions = (): PaymentOptionView[] =>
  useStoreConfig().data?.paymentOptions ?? [];
