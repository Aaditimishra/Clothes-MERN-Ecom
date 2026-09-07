import {
  discountPercent,
  sizeRank,
  type ColourView,
  type Department,
  type Money,
  type ProductDetailView,
  type ProductImage,
  type ProductSpec,
  type ProductSummaryView,
  type Size,
  type SizeChartView,
  type VariantView,
} from '@shop/shared';

import type { ColourwayDoc, ProductDoc, VariantDoc } from '../../models/product.model';

/** A product counts as new for its first month on sale. */
const NEW_FOR_DAYS = 30;

const toMoney = (value: { amount: number; currency: string } | null | undefined): Money | null =>
  value ? { amount: value.amount, currency: value.currency } : null;

const isPurchasable = (variant: VariantDoc): boolean =>
  variant.isEnabled === true && (variant.stockQuantity ?? 0) > 0;

/**
 * The variant a listing card quotes.
 *
 * Purchasable variants win outright — quoting a "from ₹999" that turns out to be
 * the one sold-out size is a bait-and-switch the shopper discovers only after
 * clicking. Only when nothing is purchasable does it fall back to the cheapest
 * overall, so the card can still show a price instead of a blank.
 */
const leadVariant = (variants: readonly VariantDoc[]): VariantDoc | null => {
  const cheapest = (pool: readonly VariantDoc[]): VariantDoc | null =>
    pool.reduce<VariantDoc | null>(
      (best, variant) => (!best || variant.price.amount < best.price.amount ? variant : best),
      null,
    );

  return cheapest(variants.filter(isPurchasable)) ?? cheapest(variants);
};

const colourLabelOf = (product: ProductDoc, code: string): string =>
  product.colourways.find((colourway) => colourway.code === code)?.label ?? code;

const toImage = (image: {
  url: string;
  alt?: string | null;
  kind?: string | null;
  posterUrl?: string | null;
}): ProductImage => ({
  url: image.url,
  alt: image.alt ?? '',
  kind: image.kind === 'video' ? 'video' : 'image',
  posterUrl: image.posterUrl ?? null,
});

const toColourView = (colourway: ColourwayDoc): ColourView => ({
  code: colourway.code,
  label: colourway.label,
  swatch: colourway.swatch,
  images: colourway.images.map(toImage),
});

const variantLabel = (product: ProductDoc, variant: VariantDoc): string =>
  `${variant.size.toUpperCase()} / ${colourLabelOf(product, variant.colour)}`;

const toVariantView = (product: ProductDoc, variant: VariantDoc): VariantView => ({
  id: variant.id,
  sku: variant.sku,
  size: variant.size as Size,
  colour: variant.colour,
  label: variantLabel(product, variant),
  price: { amount: variant.price.amount, currency: variant.price.currency },
  compareAtPrice: toMoney(variant.compareAtPrice),
  stockQuantity: variant.stockQuantity ?? 0,
  isAvailable: isPurchasable(variant),
});

/**
 * What a listing card shows.
 *
 * Prefers the first still image, and falls back to a video's poster. A card that
 * pointed at an `.mp4` would render a black rectangle until the browser decoded
 * a frame — on a grid of 24 that is megabytes of video fetched to draw
 * thumbnails nobody asked to watch.
 */
const cardImage = (product: ProductDoc): { imageUrl: string | null; imageAlt: string } => {
  const images = product.colourways[0]?.images ?? [];
  const still = images.find((image) => image.kind !== 'video');
  const chosen = still ?? images[0];

  return {
    imageUrl: (still ? still.url : chosen?.posterUrl) ?? null,
    imageAlt: chosen?.alt ?? product.name,
  };
};

export const toSummary = (product: ProductDoc): ProductSummaryView => {
  const lead = leadVariant(product.variants);
  const price = lead ? { amount: lead.price.amount, currency: lead.price.currency } : null;
  const compareAt = lead ? toMoney(lead.compareAtPrice) : null;

  const sizesInStock = [
    ...new Set(product.variants.filter(isPurchasable).map((variant) => variant.size)),
  ].sort((left, right) => sizeRank(left) - sizeRank(right)) as Size[];

  const publishedAt = product.publishedAt?.getTime() ?? null;
  const isNew =
    publishedAt !== null && Date.now() - publishedAt < NEW_FOR_DAYS * 24 * 60 * 60 * 1000;

  return {
    id: product._id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    brandCode: product.brandCode,
    department: product.department as Department,
    fromPrice: price,
    compareAtPrice: compareAt,
    discountPercent: price ? discountPercent(price, compareAt) : null,
    ...cardImage(product),
    colours: product.colourways.map(({ code, label, swatch }) => ({ code, label, swatch })),
    sizesInStock,
    rating: product.ratingAverage ?? null,
    reviewCount: product.reviewCount ?? 0,
    isAvailable: sizesInStock.length > 0,
    isNew,
  };
};

/**
 * The specification table.
 *
 * Built on the server because the labels ("Sleeve length", not "sleeveLength")
 * and the decision to omit empty rows both belong to one place. Shipping raw
 * field names to every shopper so the browser can prettify them is work done
 * once per visitor instead of once per developer.
 */
const SPEC_FIELDS: ReadonlyArray<[keyof ProductDoc, string]> = [
  ['fabric', 'Fabric'],
  ['fit', 'Fit'],
  ['sleeveLength', 'Sleeve length'],
  ['neckline', 'Neckline'],
  ['pattern', 'Pattern'],
  ['occasion', 'Occasion'],
];

const titleCase = (value: string): string =>
  value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const toSpecs = (product: ProductDoc): ProductSpec[] =>
  SPEC_FIELDS.flatMap(([field, label]) => {
    const value = product[field];
    return typeof value === 'string' && value.length > 0
      ? [{ label, value: titleCase(value) }]
      : [];
  });

export const toDetail = (
  product: ProductDoc,
  breadcrumbs: Array<{ slug: string; name: string }>,
  sizeChart: SizeChartView | null,
): ProductDetailView => ({
  ...toSummary(product),
  description: product.description ?? '',
  highlights: [...product.highlights],
  careInstructions: product.careInstructions ?? null,
  specs: toSpecs(product),
  colourways: product.colourways.map(toColourView),
  variants: product.variants
    .map((variant) => toVariantView(product, variant))
    .sort((left, right) => sizeRank(left.size) - sizeRank(right.size)),
  sizeChart,
  categoryIds: [...product.categoryIds],
  breadcrumbs,
});
