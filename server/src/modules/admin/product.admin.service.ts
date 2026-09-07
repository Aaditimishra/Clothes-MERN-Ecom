import { newId, sizeRank, slugify, type Money } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { ProductModel, type ProductDoc } from '../../models/product.model';
import { termMap } from '../taxonomy/taxonomy.service';

export interface AdminImageInput {
  mediaId: string | null;
  url: string;
  alt?: string;
  kind?: 'image' | 'video';
  posterUrl?: string | null;
}

export interface AdminColourwayInput {
  code: string;
  images: AdminImageInput[];
}

export interface AdminProductInput {
  name: string;
  slug?: string;
  brandCode: string;
  status?: 'draft' | 'active' | 'archived';
  description?: string;
  highlights?: string[];
  careInstructions?: string | null;
  department: string;
  fabric?: string | null;
  fit?: string | null;
  sleeveLength?: string | null;
  occasion?: string | null;
  pattern?: string | null;
  neckline?: string | null;
  primaryCategoryId?: string | null;
  categoryIds?: string[];
  sizeChartId?: string | null;
  colourways: AdminColourwayInput[];
  sizes: string[];
  /** Base price in minor units; the matrix is generated from it. */
  price: number;
  compareAtPrice?: number | null;
  /** Stock applied to newly created combinations only. */
  defaultStock?: number;
}

/** Deterministic, readable, and unique per size × colour. */
const buildSku = (brandCode: string, slug: string, colour: string, size: string): string => {
  const initials = slug
    .split('-')
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 5);

  return [
    brandCode.slice(0, 3).toUpperCase(),
    initials,
    colour.slice(0, 3).toUpperCase(),
    size.toUpperCase(),
  ].join('-');
};

const axisKey = (colour: string, size: string): string => `${colour}::${size}`;

/**
 * The variant shape, declared structurally.
 *
 * `ProductDoc['variants']` is a Mongoose `DocumentArray`, which cannot be built
 * from a plain array literal. Reconciliation is pure logic over plain objects,
 * so it works on this shape and Mongoose casts on assignment.
 */
interface VariantShape {
  id: string;
  sku: string;
  size: string;
  colour: string;
  price: Money;
  compareAtPrice: Money | null;
  stockQuantity: number;
  isEnabled: boolean;
}

/**
 * Brings the variant matrix in line with the chosen sizes and colours.
 *
 * The rule that matters: **a surviving combination keeps its variant**, with its
 * price and its stock intact. Merchants add a colour routinely, and regenerating
 * from scratch would silently reset the price and stock of everything already
 * selling — the single most destructive thing this module could do. Matching is
 * therefore by axis key, never by array index.
 *
 * Combinations that disappear are DISABLED, not deleted: order history references
 * them by id, and a shop that loses what it sold cannot answer a customer.
 */
const reconcileVariants = (
  existing: readonly VariantShape[],
  input: {
    brandCode: string;
    slug: string;
    colours: string[];
    sizes: string[];
    price: Money;
    compareAtPrice: Money | null;
    defaultStock: number;
  },
): VariantShape[] => {
  const byKey = new Map(existing.map((variant) => [axisKey(variant.colour, variant.size), variant]));
  const wanted = new Set<string>();

  const next: VariantShape[] = [];

  for (const colour of input.colours) {
    for (const size of input.sizes) {
      const key = axisKey(colour, size);
      wanted.add(key);

      const current = byKey.get(key);
      if (current) {
        // Re-enabled if it had been disabled by an earlier removal, but its price
        // and stock are left exactly as the merchant last set them.
        next.push({ ...current, isEnabled: true });
        continue;
      }

      next.push({
        id: newId('var'),
        sku: buildSku(input.brandCode, input.slug, colour, size),
        size,
        colour,
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        stockQuantity: input.defaultStock,
        isEnabled: true,
      });
    }
  }

  for (const [key, variant] of byKey) {
    if (wanted.has(key)) continue;
    next.push({ ...variant, isEnabled: false });
  }

  return next.sort(
    (left, right) =>
      left.colour.localeCompare(right.colour) || sizeRank(left.size) - sizeRank(right.size),
  );
};

/**
 * Validates every taxonomy reference before writing.
 *
 * A product saved with `fabric: 'corduory'` is not an error anyone sees — it
 * simply never appears under any fabric filter, and the merchant concludes the
 * filter is broken. Checking on write turns a silent disappearance into a
 * message naming the field.
 */
const assertVocabulary = async (input: AdminProductInput): Promise<void> => {
  const checks: Array<[string, string | null | undefined, Parameters<typeof termMap>[0]]> = [
    ['brandCode', input.brandCode, 'brand'],
    ['department', input.department, 'department'],
    ['fabric', input.fabric, 'fabric'],
    ['fit', input.fit, 'fit'],
    ['occasion', input.occasion, 'occasion'],
    ['sleeveLength', input.sleeveLength, 'sleeve-length'],
    ['pattern', input.pattern, 'pattern'],
    ['neckline', input.neckline, 'neckline'],
  ];

  const fields: Record<string, string> = {};

  for (const [field, value, group] of checks) {
    if (!value) continue;
    const terms = await termMap(group);
    if (!terms.has(value)) fields[field] = `'${value}' is not a known ${group}`;
  }

  const [colours, sizes] = await Promise.all([termMap('colour'), termMap('size')]);

  for (const colourway of input.colourways) {
    if (!colours.has(colourway.code)) {
      fields.colourways = `'${colourway.code}' is not a known colour`;
    }
  }

  for (const size of input.sizes) {
    if (!sizes.has(size)) fields.sizes = `'${size}' is not a known size`;
  }

  if (Object.keys(fields).length > 0) {
    throw ApiError.badRequest('Some values are not in the shop vocabulary', fields);
  }
};

interface ColourwayShape {
  code: string;
  label: string;
  swatch: string;
  images: Array<{
    mediaId: string | null;
    url: string;
    alt: string;
    kind: 'image' | 'video';
    posterUrl: string | null;
  }>;
}

const buildColourways = async (
  input: AdminColourwayInput[],
): Promise<ColourwayShape[]> => {
  const colours = await termMap('colour');

  return input.map((colourway) => {
    const term = colours.get(colourway.code);
    return {
      code: colourway.code,
      // Label and swatch are COPIED from the vocabulary at save time so a
      // listing can draw a swatch without joining the taxonomy on every read.
      // Renaming a colour therefore needs a re-save; that is the cost of the
      // read being one query instead of two.
      label: term?.label ?? colourway.code,
      swatch: term?.swatch ?? '#cbd5e1',
      images: colourway.images.map((image) => ({
        mediaId: image.mediaId ?? null,
        url: image.url,
        alt: image.alt ?? '',
        kind: image.kind ?? 'image',
        posterUrl: image.posterUrl ?? null,
      })),
    };
  });
};

/** Mongoose subdocuments carry methods; reconciliation only wants the fields. */
const toVariantShapes = (
  variants: ProductDoc['variants'],
): VariantShape[] =>
  variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    colour: variant.colour,
    price: { amount: variant.price.amount, currency: variant.price.currency },
    compareAtPrice: variant.compareAtPrice
      ? { amount: variant.compareAtPrice.amount, currency: variant.compareAtPrice.currency }
      : null,
    stockQuantity: variant.stockQuantity ?? 0,
    isEnabled: variant.isEnabled ?? true,
  }));

const assertUniqueSlug = async (slug: string, exceptId?: string): Promise<void> => {
  const clash = await ProductModel.exists({
    slug,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });

  if (clash) {
    throw ApiError.conflict(`'${slug}' is already used by another product`, {
      slug: 'Already in use',
    });
  }
};

export const createProduct = async (input: AdminProductInput): Promise<ProductDoc> => {
  await assertVocabulary(input);

  const slug = slugify(input.slug ?? input.name);
  if (!slug) {
    throw ApiError.badRequest('Cannot derive a URL from that name', {
      slug: 'Enter a URL slug',
    });
  }
  await assertUniqueSlug(slug);

  const price: Money = { amount: input.price, currency: 'INR' };
  const compareAtPrice = input.compareAtPrice
    ? { amount: input.compareAtPrice, currency: 'INR' }
    : null;

  const created = await ProductModel.create({
    _id: newId('prd'),
    slug,
    name: input.name.trim(),
    brand: (await termMap('brand')).get(input.brandCode)?.label ?? input.brandCode,
    brandCode: input.brandCode,
    // Everything starts as a draft unless asked otherwise. Merchants save
    // half-finished products constantly, and forcing valid data on first save
    // makes them invent placeholder values that later reach customers.
    status: input.status ?? 'draft',
    description: input.description ?? '',
    highlights: input.highlights ?? [],
    careInstructions: input.careInstructions ?? null,
    department: input.department,
    fabric: input.fabric ?? null,
    fit: input.fit ?? null,
    sleeveLength: input.sleeveLength ?? null,
    occasion: input.occasion ?? null,
    pattern: input.pattern ?? null,
    neckline: input.neckline ?? null,
    primaryCategoryId: input.primaryCategoryId ?? null,
    categoryIds: normaliseCategories(input.primaryCategoryId ?? null, input.categoryIds ?? []),
    sizeChartId: input.sizeChartId ?? null,
    colourways: await buildColourways(input.colourways),
    variants: reconcileVariants([], {
      brandCode: input.brandCode,
      slug,
      colours: input.colourways.map((colourway) => colourway.code),
      sizes: input.sizes,
      price,
      compareAtPrice,
      defaultStock: input.defaultStock ?? 0,
    }),
    publishedAt: input.status === 'active' ? new Date() : null,
  });

  return created.toObject();
};

export const updateProduct = async (
  id: string,
  input: AdminProductInput,
): Promise<ProductDoc> => {
  const existing = await ProductModel.findById(id);
  if (!existing) throw ApiError.notFound('No such product');

  await assertVocabulary(input);

  const slug = slugify(input.slug ?? input.name);
  await assertUniqueSlug(slug, id);

  const price: Money = { amount: input.price, currency: 'INR' };
  const compareAtPrice = input.compareAtPrice
    ? { amount: input.compareAtPrice, currency: 'INR' }
    : null;

  existing.set({
    slug,
    name: input.name.trim(),
    brand: (await termMap('brand')).get(input.brandCode)?.label ?? input.brandCode,
    brandCode: input.brandCode,
    status: input.status ?? existing.status,
    description: input.description ?? '',
    highlights: input.highlights ?? [],
    careInstructions: input.careInstructions ?? null,
    department: input.department,
    fabric: input.fabric ?? null,
    fit: input.fit ?? null,
    sleeveLength: input.sleeveLength ?? null,
    occasion: input.occasion ?? null,
    pattern: input.pattern ?? null,
    neckline: input.neckline ?? null,
    primaryCategoryId: input.primaryCategoryId ?? null,
    categoryIds: normaliseCategories(input.primaryCategoryId ?? null, input.categoryIds ?? []),
    sizeChartId: input.sizeChartId ?? null,
    colourways: await buildColourways(input.colourways),
    variants: reconcileVariants(toVariantShapes(existing.variants), {
      brandCode: input.brandCode,
      slug,
      colours: input.colourways.map((colourway) => colourway.code),
      sizes: input.sizes,
      price,
      compareAtPrice,
      defaultStock: input.defaultStock ?? 0,
    }),
  });

  // Stamped the first time a product goes live, and never moved afterwards —
  // "new in" should reflect when it first appeared, not when it was last edited.
  if (input.status === 'active' && !existing.publishedAt) {
    existing.publishedAt = new Date();
  }

  await existing.save();
  return existing.toObject();
};

/** The primary category is always part of the full membership list. */
const normaliseCategories = (primary: string | null, all: string[]): string[] => {
  const set = new Set(all.filter(Boolean));
  if (primary) set.add(primary);
  return [...set];
};

/** Per-variant edits: the price and stock grid in the product editor. */
export const updateVariant = async (
  productId: string,
  variantId: string,
  patch: { price?: number; compareAtPrice?: number | null; stockQuantity?: number; isEnabled?: boolean },
): Promise<ProductDoc> => {
  const set: Record<string, unknown> = {};

  if (patch.price !== undefined) set['variants.$.price'] = { amount: patch.price, currency: 'INR' };
  if (patch.compareAtPrice !== undefined) {
    set['variants.$.compareAtPrice'] = patch.compareAtPrice
      ? { amount: patch.compareAtPrice, currency: 'INR' }
      : null;
  }
  if (patch.stockQuantity !== undefined) set['variants.$.stockQuantity'] = patch.stockQuantity;
  if (patch.isEnabled !== undefined) set['variants.$.isEnabled'] = patch.isEnabled;

  const updated = await ProductModel.findOneAndUpdate(
    { _id: productId, 'variants.id': variantId },
    { $set: set },
    { new: true },
  ).lean();

  if (!updated) throw ApiError.notFound('No such variant');
  return updated as ProductDoc;
};

/**
 * Archiving rather than deleting.
 *
 * Orders reference products, and a shop that loses the name of what it sold
 * cannot answer a customer question or file its taxes.
 */
export const archiveProduct = async (id: string): Promise<void> => {
  const result = await ProductModel.updateOne({ _id: id }, { $set: { status: 'archived' } });
  if (result.matchedCount === 0) throw ApiError.notFound('No such product');
};

export const setProductStatus = async (
  id: string,
  status: 'draft' | 'active' | 'archived',
): Promise<ProductDoc> => {
  const product = await ProductModel.findById(id);
  if (!product) throw ApiError.notFound('No such product');

  if (status === 'active' && product.variants.every((variant) => !variant.isEnabled)) {
    throw ApiError.unprocessable(
      'A product needs at least one enabled size before it can go live',
    );
  }

  product.status = status;
  if (status === 'active' && !product.publishedAt) product.publishedAt = new Date();

  await product.save();
  return product.toObject();
};

/**
 * Applies one price across every variant of a product.
 *
 * The base price in the editor deliberately only seeds NEW size × colour
 * combinations — overwriting existing ones would silently wipe the per-size
 * ladder and any manual override the moment someone added a colour. But a
 * merchant putting a whole line up by ₹100 needs a way to say so, and doing it
 * cell by cell across thirty variants is how mistakes happen.
 *
 * So it is an explicit, separate action: nothing changes unless it is asked for.
 * Disabled variants are included, because a size that is temporarily off sale
 * should come back at the current price rather than last season's.
 */
export const applyPriceToAllVariants = async (
  id: string,
  price: number,
  compareAtPrice: number | null,
): Promise<ProductDoc> => {
  const product = await ProductModel.findById(id);
  if (!product) throw ApiError.notFound('No such product');

  for (const variant of product.variants) {
    variant.price = { amount: price, currency: 'INR' };
    variant.compareAtPrice = compareAtPrice
      ? { amount: compareAtPrice, currency: 'INR' }
      : null;
  }

  await product.save();
  return product.toObject();
};
