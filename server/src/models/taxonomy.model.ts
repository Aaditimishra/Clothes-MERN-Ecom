import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * The shop's controlled vocabulary, in the database rather than in code.
 *
 * Colours, fabrics, fits, occasions, sizes and departments all share one
 * collection because they are the same shape — a code, a label, an order — and
 * differ only in which `group` they belong to. One collection means one admin
 * screen, one set of endpoints and one cache, instead of six near-identical
 * copies of each.
 *
 * Why it must be data: a merchant adding "Corduroy" should not need a
 * deployment. The storefront reads these to build its filter panel, so a term
 * added here appears in the shop on the next request.
 */
export const TAXONOMY_GROUPS = [
  'colour',
  'fabric',
  'fit',
  'occasion',
  'sleeve-length',
  'pattern',
  'neckline',
  'department',
  'size',
  'brand',
] as const;
export type TaxonomyGroup = (typeof TAXONOMY_GROUPS)[number];

const taxonomyTermSchema = new Schema(
  {
    _id: { type: String, required: true },
    group: { type: String, required: true, index: true },
    /** Stable machine key. Referenced by products; never shown to a shopper. */
    code: { type: String, required: true, lowercase: true, trim: true },
    /** What the shopper reads. Safe to rename at any time. */
    label: { type: String, required: true, trim: true },
    /** Colours only: the hex rendered as the swatch dot. */
    swatch: { type: String, default: null },
    /**
     * Sort order within the group.
     *
     * The reason sizes are not sorted alphabetically: a selector reading
     * `L, M, S, XL` looks broken to every shopper. Position is explicit so the
     * merchant controls it.
     */
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    /** Filter panels only show terms flagged for it. */
    isFilterable: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'taxonomy_terms', _id: false },
);

// A code is unique within its group, not globally — "black" is a valid colour
// and could equally be a valid pattern name.
taxonomyTermSchema.index({ group: 1, code: 1 }, { unique: true });
taxonomyTermSchema.index({ group: 1, position: 1 });

export type TaxonomyTermDoc = InferSchemaType<typeof taxonomyTermSchema>;
export const TaxonomyTermModel = model('TaxonomyTerm', taxonomyTermSchema);
