import type { Money } from '../utils/money';

/**
 * Product lifecycle.
 *
 * `draft` exists because merchants save half-finished products constantly. A
 * draft skips the required-field checks that publishing enforces; without that
 * split the only way to save a partial product is to invent placeholder values,
 * and those placeholders reach customers.
 */
export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const DEPARTMENTS = ['women', 'men', 'kids', 'unisex'] as const;
export type Department = (typeof DEPARTMENTS)[number];

/**
 * Sizes are an ordered list, not a free string.
 *
 * The order is the whole point: a size selector that renders `L, M, S, XL`
 * because that is alphabetical looks broken to every shopper. Sorting anywhere
 * in the stack refers back to this array's index.
 */
export const SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'] as const;
export type Size = (typeof SIZES)[number];

export const sizeRank = (size: string): number => {
  const index = (SIZES as readonly string[]).indexOf(size);
  // Unknown sizes sort last rather than first, so a bad import cannot push a
  // nonsense value to the front of every size selector in the shop.
  return index === -1 ? SIZES.length : index;
};

/**
 * One photograph.
 *
 * Alt text travels WITH the url rather than being generated in the browser from
 * the product name. A generated string describes the product; only a person can
 * describe the picture — which is what a screen-reader user actually needs.
 */
export interface ProductImage {
  url: string;
  alt: string;
  /** `video` items render a `<video>`; everything else is an `<img>`. */
  kind: 'image' | 'video';
  /** Video only: the still shown before playback and in every grid. */
  posterUrl: string | null;
}

/** A colourway: its own swatch and its own photographs. */
export interface ColourView {
  code: string;
  label: string;
  /** Hex used for the swatch dot in filters and on the product page. */
  swatch: string;
  /** Gallery for this colourway. Selecting a swatch swaps the whole gallery. */
  images: ProductImage[];
}

/**
 * One purchasable item: a single size × colour combination.
 *
 * Apparel needs two axes where fragrance needs one, which is why size and
 * colour are named fields here rather than an untyped map — a clothes shop
 * queries "everything left in M" often enough that it deserves an index.
 */
export interface VariantView {
  id: string;
  sku: string;
  size: Size;
  colour: string;
  /** Human-readable summary: "M / Black". */
  label: string;
  price: Money;
  /** Struck-through reference price, when the variant is discounted. */
  compareAtPrice: Money | null;
  stockQuantity: number;
  isAvailable: boolean;
}

/** One row in the product page's specification table. */
export interface ProductSpec {
  label: string;
  value: string;
}

/**
 * A size chart, as the product page renders it.
 *
 * Columns are data because garments do not share measurements: a dress needs
 * chest/waist/hip/length, a trouser needs waist/hip/inseam. Hard-coding four
 * columns forces every trouser to report a chest measurement.
 */
export interface SizeChartColumn {
  code: string;
  label: string;
}

export interface SizeChartRow {
  size: Size;
  /** Column code → measurement. Missing columns render as a dash. */
  values: Record<string, number>;
}

export interface SizeChartView {
  id: string;
  name: string;
  unit: string;
  columns: SizeChartColumn[];
  rows: SizeChartRow[];
  note: string | null;
}

export interface ProductSummaryView {
  id: string;
  slug: string;
  name: string;
  brand: string;
  brandCode: string;
  department: Department;
  /** Cheapest available variant — what "from ₹X" is derived from. */
  fromPrice: Money | null;
  compareAtPrice: Money | null;
  discountPercent: number | null;
  /** First image of the first colourway. */
  imageUrl: string | null;
  imageAlt: string;
  /** Swatches shown under the card, so a shopper sees the range without a click. */
  colours: Array<Pick<ColourView, 'code' | 'label' | 'swatch'>>;
  /** Sizes with stock right now. An out-of-stock size is struck through, not hidden. */
  sizesInStock: Size[];
  rating: number | null;
  reviewCount: number;
  isAvailable: boolean;
  isNew: boolean;
}

export interface ProductDetailView extends ProductSummaryView {
  description: string;
  highlights: string[];
  careInstructions: string | null;
  specs: ProductSpec[];
  colourways: ColourView[];
  variants: VariantView[];
  sizeChart: SizeChartView | null;
  categoryIds: string[];
  breadcrumbs: Array<{ slug: string; name: string }>;
}

/** A filter the storefront can offer, counted against the current result set. */
export interface CatalogFacetValue {
  value: string;
  label: string;
  count: number;
  /** Present on colour facets only. */
  swatch?: string;
}

export interface CatalogFacet {
  code: string;
  label: string;
  type: 'swatch' | 'chip' | 'list';
  values: CatalogFacetValue[];
}

export const CATALOG_SORTS = [
  'relevance',
  'newest',
  'price-asc',
  'price-desc',
  'discount',
  'rating',
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogListingResponse {
  items: ProductSummaryView[];
  facets: CatalogFacet[];
  total: number;
  page: number;
  pageCount: number;
  /** Echoed back so the UI can render "Dresses" without a second request. */
  category: CategoryView | null;
}

export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  department: Department | null;
  parentId: string | null;
  /** Ancestor ids, root first. Empty for a root category. */
  path: string[];
  imageUrl: string | null;
  productCount: number;
}

/** A category with its children inlined — what the mega menu renders from. */
export interface CategoryTreeNode extends CategoryView {
  children: CategoryTreeNode[];
}
