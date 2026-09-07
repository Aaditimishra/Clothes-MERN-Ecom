import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * Money is embedded as `{ amount, currency }` with an INTEGER amount in minor
 * units. Declared inline (not as a sub-schema) so Mongoose does not attach an
 * `_id` to every price in the database.
 */
const moneySchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'INR', uppercase: true },
  },
  { _id: false },
);

/**
 * A colourway carries its own photographs.
 *
 * This is the difference between an apparel catalogue and a generic one: picking
 * "Sage" must swap the entire gallery, not tint a thumbnail. Hanging images off
 * the colour rather than the product is what makes that a lookup instead of a
 * guess.
 */
/**
 * An image on a product.
 *
 * Both `mediaId` and `url` are stored. The url is what renders, so a listing of
 * 24 products needs no second query to draw 24 photographs; the mediaId is the
 * link back to the library, so the admin can show which products use an asset
 * before anyone deletes it.
 *
 * The cost of denormalising is that replacing a file in the library does not
 * silently rewrite every product using it — which is the safer default anyway:
 * a merchant swapping a photo should see which pages change.
 */
const productImageSchema = new Schema(
  {
    mediaId: { type: String, default: null },
    url: { type: String, required: true },
    alt: { type: String, default: '' },
    /** `image` or `video`. A colourway gallery can mix both. */
    kind: { type: String, default: 'image' },
    /**
     * Video only: the frame to show before it plays.
     *
     * Without one the listing card would have to load and decode the video just
     * to draw a thumbnail — on a 24-card grid that is megabytes of traffic for
     * pictures nobody has asked to watch yet.
     */
    posterUrl: { type: String, default: null },
  },
  { _id: false },
);

const colourwaySchema = new Schema(
  {
    code: { type: String, required: true, lowercase: true, trim: true },
    label: { type: String, required: true },
    swatch: { type: String, required: true },
    images: { type: [productImageSchema], default: [] },
  },
  { _id: false },
);

/**
 * One purchasable item: a single size × colour pair.
 *
 * Variants are embedded because they have no life outside their product — no
 * query ever asks for a variant without knowing its garment. Embedding also
 * makes "add to bag" a single atomic document read.
 */
const variantSchema = new Schema(
  {
    id: { type: String, required: true },
    sku: { type: String, required: true, uppercase: true, trim: true },
    size: { type: String, required: true },
    colour: { type: String, required: true, lowercase: true },
    price: { type: moneySchema, required: true },
    compareAtPrice: { type: moneySchema, default: null },
    stockQuantity: { type: Number, default: 0, min: 0 },
    isEnabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    /** Display name, e.g. "Mercer Denim". Safe to rename at any time. */
    brand: { type: String, required: true, trim: true },
    /**
     * The stable key filters match on.
     *
     * Filtering on the display name was a real bug: the facet emitted
     * "Mercer Denim" while the query lowercased it to "mercer denim", so every
     * brand filter returned nothing. A code that is lowercase on both sides
     * cannot drift.
     */
    brandCode: { type: String, required: true, lowercase: true, trim: true, index: true },
    status: { type: String, required: true, default: 'draft', index: true },

    description: { type: String, default: '' },
    highlights: { type: [String], default: [] },
    careInstructions: { type: String, default: null },

    department: { type: String, required: true, index: true },
    fabric: { type: String, default: null, index: true },
    fit: { type: String, default: null, index: true },
    sleeveLength: { type: String, default: null },
    occasion: { type: String, default: null, index: true },
    pattern: { type: String, default: null },
    neckline: { type: String, default: null },

    primaryCategoryId: { type: String, default: null, index: true },
    categoryIds: { type: [String], default: [], index: true },

    colourways: { type: [colourwaySchema], default: [] },
    variants: { type: [variantSchema], default: [] },
    /** Reference to a shared chart. One chart serves every dress in the shop. */
    sizeChartId: { type: String, default: null, index: true },

    /**
     * Denormalised from the reviews collection.
     *
     * A listing of 48 cards would otherwise need an aggregation over every
     * review in the shop to draw 48 star ratings. These two fields are
     * recalculated whenever a review lands — see `recalculateProductRating`.
     */
    ratingAverage: { type: Number, default: null },
    reviewCount: { type: Number, default: 0 },

    /** Drives "sort by newest" and the NEW badge without a separate flag to forget. */
    publishedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, collection: 'products', _id: false },
);

// Full-text search over the fields a shopper actually types: "black linen shirt".
productSchema.index(
  { name: 'text', brand: 'text', description: 'text', fabric: 'text' },
  { weights: { name: 10, brand: 5, description: 1 }, name: 'product_search' },
);

// The storefront's main query: published products in a category.
productSchema.index({ status: 1, categoryIds: 1 });
// SKUs are unique shop-wide, not per product — a warehouse scanning a barcode
// must land on exactly one variant.
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });
// "What is left in M" — the restock and filter query.
productSchema.index({ status: 1, 'variants.size': 1 });

export type ProductDoc = InferSchemaType<typeof productSchema>;
export type VariantDoc = ProductDoc['variants'][number];
export type ColourwayDoc = ProductDoc['colourways'][number];
export const ProductModel = model('Product', productSchema);
