import type { PipelineStage } from 'mongoose';

import type { CatalogQuery, FacetKey } from './catalog.query';

/**
 * Only variants a shopper can actually buy count towards a filter.
 *
 * Filtering on "size M" and landing on a grid where half the garments have no M
 * left is the fastest way to lose trust in a filter panel. This expression is
 * reused by the match stage, the facet counts and the sort, so all three agree
 * on what "available" means.
 */
export const PURCHASABLE_VARIANTS: PipelineStage.AddFields['$addFields'] = {
  _available: {
    $filter: {
      input: '$variants',
      as: 'variant',
      cond: {
        $and: [
          { $eq: ['$$variant.isEnabled', true] },
          { $gt: ['$$variant.stockQuantity', 0] },
        ],
      },
    },
  },
};

export interface MatchContext {
  query: CatalogQuery;
  /** The category plus every descendant, so browsing Women includes Dresses. */
  categoryIds: string[] | null;
  /**
   * The dimension to leave OUT of the match.
   *
   * A facet must be counted against every filter EXCEPT its own. Otherwise
   * selecting "Black" collapses the colour facet to a single option and the
   * shopper can never widen their choice without clearing it first.
   */
  excluding?: FacetKey | null;
}

type Condition = Record<string, unknown>;

const inIfAny = (values: readonly string[]): Condition | null =>
  values.length > 0 ? { $in: values } : null;

/**
 * Builds the match conditions as an `$and` array rather than one object.
 *
 * Size, colour and price all constrain the SAME `variants` array with separate
 * `$elemMatch`es. As object keys they would collide and the last one silently
 * wins; as `$and` entries every constraint survives.
 */
export const buildMatch = ({
  query,
  categoryIds,
  excluding = null,
}: MatchContext): Condition => {
  const conditions: Condition[] = [{ status: 'active' }];

  if (query.search) conditions.push({ $text: { $search: query.search } });
  if (categoryIds) conditions.push({ categoryIds: { $in: categoryIds } });
  if (query.department) conditions.push({ department: query.department });

  // Matched on `brandCode`, never the display name — see the note on the brand
  // facet spec. Both sides are lowercase, so they cannot drift apart.
  const brand = excluding === 'brand' ? null : inIfAny(query.brand);
  if (brand) conditions.push({ brandCode: brand });

  const fabric = excluding === 'fabric' ? null : inIfAny(query.fabric);
  if (fabric) conditions.push({ fabric });

  const fit = excluding === 'fit' ? null : inIfAny(query.fit);
  if (fit) conditions.push({ fit });

  const occasion = excluding === 'occasion' ? null : inIfAny(query.occasion);
  if (occasion) conditions.push({ occasion });

  const size = excluding === 'size' ? null : inIfAny(query.size);
  if (size) {
    conditions.push({
      variants: { $elemMatch: { size, isEnabled: true, stockQuantity: { $gt: 0 } } },
    });
  }

  const colour = excluding === 'colour' ? null : inIfAny(query.colour);
  if (colour) {
    conditions.push({
      variants: { $elemMatch: { colour, isEnabled: true, stockQuantity: { $gt: 0 } } },
    });
  }

  /**
   * Price bounds apply to a SINGLE variant, not to the product's range.
   *
   * Written as two separate keys inside one `$elemMatch`, a ₹500–₹1,000 filter
   * would match a garment whose XS costs ₹400 and whose XL costs ₹1,200 —
   * neither of which is in range. One `$elemMatch` means one variant must
   * satisfy both bounds.
   */
  const priceBounds: Condition = {};
  if (query.minPrice !== undefined) priceBounds.$gte = query.minPrice;
  if (query.maxPrice !== undefined) priceBounds.$lte = query.maxPrice;

  if (Object.keys(priceBounds).length > 0) {
    conditions.push({
      variants: { $elemMatch: { 'price.amount': priceBounds, isEnabled: true } },
    });
  }

  return conditions.length === 1 ? conditions[0]! : { $and: conditions };
};
