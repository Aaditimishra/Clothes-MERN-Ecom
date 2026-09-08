import type { PipelineStage } from 'mongoose';
import type {
  CatalogFacet,
  CatalogFacetValue,
  CatalogListingResponse,
  CategoryTreeNode,
  CategoryView,
  Department,
  ProductDetailView,
  ProductSummaryView,
} from '@shop/shared';
import { sizeRank } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { CategoryModel, type CategoryDoc } from '../../models/category.model';
import { ProductModel, type ProductDoc } from '../../models/product.model';
import { buildMatch, PURCHASABLE_VARIANTS } from './catalog.filters';
import { toDetail, toSummary } from './catalog.mapper';
import { FACET_KEYS, type CatalogQuery, type FacetKey } from './catalog.query';
import { termMap } from '../taxonomy/taxonomy.service';
import { findSizeChart } from './size-chart.service';

/**
 * Derived fields the listing needs but the document does not store.
 *
 * Computed in the pipeline rather than in JavaScript because they are what the
 * SORT runs on. Sorting by price after paging would order 24 rows out of 4,000
 * — the page would be arbitrary and the order within it meaningless.
 */
const DERIVED_FIELDS: PipelineStage[] = [
  { $addFields: PURCHASABLE_VARIANTS },
  {
    $addFields: {
      // Price is quoted from what is buyable; only a fully sold-out garment
      // falls back to its full variant list, and only so the card shows a price.
      _pricePool: {
        $cond: [{ $gt: [{ $size: '$_available' }, 0] }, '$_available', '$variants'],
      },
    },
  },
  {
    $addFields: {
      _minPrice: { $min: '$_pricePool.price.amount' },
      _discount: {
        $max: {
          $map: {
            input: '$_pricePool',
            as: 'variant',
            in: {
              $cond: [
                {
                  $gt: [
                    { $ifNull: ['$$variant.compareAtPrice.amount', 0] },
                    '$$variant.price.amount',
                  ],
                },
                {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $subtract: [
                            '$$variant.compareAtPrice.amount',
                            '$$variant.price.amount',
                          ],
                        },
                        '$$variant.compareAtPrice.amount',
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    },
  },
];

/**
 * Every sort ends with `_id` ascending.
 *
 * Without a unique tiebreaker, two products with the same price have no defined
 * order between pages — Mongo may return one on page 1 and again on page 2 while
 * another never appears at all. The shopper sees a duplicate and a missing item
 * and there is nothing in the logs to explain it.
 */
const sortStage = (query: CatalogQuery): PipelineStage.Sort => {
  const byRelevance: Record<string, unknown> = query.search
    ? { score: { $meta: 'textScore' } }
    : { publishedAt: -1 };

  const orders: Record<CatalogQuery['sort'], Record<string, unknown>> = {
    relevance: byRelevance,
    newest: { publishedAt: -1 },
    'price-asc': { _minPrice: 1 },
    'price-desc': { _minPrice: -1 },
    discount: { _discount: -1 },
    rating: { ratingAverage: -1, reviewCount: -1 },
  };

  return { $sort: { ...orders[query.sort], _id: 1 } as PipelineStage.Sort['$sort'] };
};

const toCategoryView = (doc: CategoryDoc, productCount = 0): CategoryView => ({
  id: doc._id,
  slug: doc.slug,
  name: doc.name,
  description: doc.description ?? null,
  department: (doc.department as Department | null) ?? null,
  parentId: doc.parentId ?? null,
  path: [...doc.path],
  imageUrl: doc.imageUrl ?? null,
  productCount,
});

/**
 * Resolves a category slug to itself plus every descendant.
 *
 * Browsing "Women" must show the dresses filed under Women → Dresses → Midi, not
 * only the handful assigned directly to the root. The materialised `path` makes
 * that one indexed query instead of a recursive walk.
 */
const resolveCategoryScope = async (
  slug: string,
): Promise<{ category: CategoryDoc; ids: string[] }> => {
  const category = await CategoryModel.findOne({ slug, isVisible: true }).lean();
  if (!category) throw ApiError.notFound(`No category at '${slug}'`);

  const descendants = await CategoryModel.find({ path: category._id })
    .select('_id')
    .lean();

  return {
    category,
    ids: [category._id, ...descendants.map((entry) => entry._id)],
  };
};

interface FacetSpec {
  label: string;
  type: CatalogFacet['type'];
  /** Which taxonomy group supplies this facet's labels and swatches. */
  group: 'colour' | 'fabric' | 'fit' | 'occasion' | 'brand' | 'size';
  /** Reads the countable codes out of a matched product. */
  valuesOf: (product: ProductDoc) => string[];
  /** Ordering within the facet; falls back to count when omitted. */
  compare?: (left: string, right: string) => number;
}

const availableVariantCodes = (
  product: ProductDoc,
  field: 'size' | 'colour',
): string[] => [
  ...new Set(
    product.variants
      .filter((variant) => variant.isEnabled && (variant.stockQuantity ?? 0) > 0)
      .map((variant) => variant[field]),
  ),
];

const FACET_SPECS: Record<FacetKey, FacetSpec> = {
  size: {
    label: 'Size',
    type: 'chip',
    group: 'size',
    valuesOf: (product) => availableVariantCodes(product, 'size'),
    compare: (left, right) => sizeRank(left) - sizeRank(right),
  },
  colour: {
    label: 'Colour',
    type: 'swatch',
    group: 'colour',
    valuesOf: (product) => availableVariantCodes(product, 'colour'),
  },
  brand: {
    label: 'Brand',
    type: 'list',
    group: 'brand',
    // Filters match `brandCode`, never the display name. The two drifted once —
    // the facet emitted "Mercer Denim" while the query lowercased it — and every
    // brand filter silently returned nothing.
    valuesOf: (product) => [product.brandCode],
    compare: (left, right) => left.localeCompare(right),
  },
  fabric: {
    label: 'Fabric',
    type: 'list',
    group: 'fabric',
    valuesOf: (product) => (product.fabric ? [product.fabric] : []),
  },
  fit: {
    label: 'Fit',
    type: 'chip',
    group: 'fit',
    valuesOf: (product) => (product.fit ? [product.fit] : []),
  },
  occasion: {
    label: 'Occasion',
    type: 'list',
    group: 'occasion',
    valuesOf: (product) => (product.occasion ? [product.occasion] : []),
  },
};

/**
 * Counts one facet against every filter except its own.
 *
 * Only the fields the spec reads are projected. A facet count over 4,000
 * products would otherwise drag the full variant array of each one across the
 * wire to count six size codes.
 */
const countFacet = async (
  key: FacetKey,
  query: CatalogQuery,
  categoryIds: string[] | null,
): Promise<CatalogFacet> => {
  const spec = FACET_SPECS[key];

  const [products, vocabulary] = await Promise.all([
    ProductModel.find(buildMatch({ query, categoryIds, excluding: key }))
      .select(
        'brandCode fabric fit occasion variants.size variants.colour variants.isEnabled variants.stockQuantity',
      )
      .lean() as unknown as Promise<ProductDoc[]>,
    termMap(spec.group),
  ]);

  const counts = new Map<string, number>();
  for (const product of products) {
    for (const code of spec.valuesOf(product)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  const values: CatalogFacetValue[] = [...counts.entries()]
    // A term the merchant deactivated stops being offered as a filter, but the
    // products keep it — so the code falls back to itself rather than vanishing.
    .filter(([value]) => vocabulary.get(value)?.isFilterable !== false)
    .map(([value, count]) => {
      const term = vocabulary.get(value);
      return {
        value,
        label: term?.label ?? value.toUpperCase(),
        count,
        ...(term?.swatch ? { swatch: term.swatch } : {}),
      };
    })
    .sort((left, right) =>
      spec.compare
        ? spec.compare(left.value, right.value)
        : right.count - left.count || left.label.localeCompare(right.label),
    );

  return { code: key, label: spec.label, type: spec.type, values };
};

export const listProducts = async (
  query: CatalogQuery,
): Promise<CatalogListingResponse> => {
  const scope = query.category ? await resolveCategoryScope(query.category) : null;
  const categoryIds = scope?.ids ?? null;
  const match = buildMatch({ query, categoryIds });

  const pipeline: PipelineStage[] = [
    { $match: match },
    ...(query.search ? [{ $addFields: { score: { $meta: 'textScore' } } }] : []),
    ...DERIVED_FIELDS,
    sortStage(query),
    { $skip: (query.page - 1) * query.pageSize },
    { $limit: query.pageSize },
    // The derived fields did their job in the sort; sending them to the browser
    // would ship a second copy of every variant array for nothing.
    { $project: { _available: 0, _pricePool: 0, _minPrice: 0, _discount: 0, score: 0 } },
  ];

  const [documents, total, ...facets] = await Promise.all([
    ProductModel.aggregate<ProductDoc>(pipeline),
    ProductModel.countDocuments(match),
    ...FACET_KEYS.map((key) => countFacet(key, query, categoryIds)),
  ]);

  const items: ProductSummaryView[] = documents.map(toSummary);

  return {
    items,
    facets: facets.filter((facet) => facet.values.length > 0),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    category: scope ? toCategoryView(scope.category, total) : null,
  };
};

export const getProductBySlug = async (slug: string): Promise<ProductDetailView> => {
  const product = await ProductModel.findOne({ slug, status: 'active' }).lean();
  if (!product) throw ApiError.notFound(`No product at '${slug}'`);

  const [breadcrumbs, sizeChart] = await Promise.all([
    buildBreadcrumbs(product.primaryCategoryId ?? null),
    findSizeChart(product.sizeChartId ?? null),
  ]);

  return toDetail(product as ProductDoc, breadcrumbs, sizeChart);
};

const buildBreadcrumbs = async (
  categoryId: string | null,
): Promise<Array<{ slug: string; name: string }>> => {
  if (!categoryId) return [];

  const category = await CategoryModel.findById(categoryId).lean();
  if (!category) return [];

  const ancestors = await CategoryModel.find({ _id: { $in: category.path } }).lean();
  // `$in` does not preserve order, so re-sort by the path's own sequence —
  // otherwise the trail reads "Dresses › Women" on some requests and the reverse
  // on others.
  const byId = new Map(ancestors.map((entry) => [entry._id, entry]));

  return [...category.path.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])), category].map(
    (entry) => ({ slug: entry.slug, name: entry.name }),
  );
};

/**
 * Related products: same category, same department, cheapest first.
 *
 * Deliberately not a recommendation engine. A simple, explainable rule that
 * always returns something beats a clever one that returns an empty rail on the
 * long tail of the catalogue.
 */
export const getRelatedProducts = async (
  slug: string,
  limit = 8,
): Promise<ProductSummaryView[]> => {
  const product = await ProductModel.findOne({ slug }).select('categoryIds department').lean();
  if (!product) return [];

  const related = await ProductModel.find({
    status: 'active',
    _id: { $ne: product._id },
    $or: [{ categoryIds: { $in: product.categoryIds } }, { department: product.department }],
  })
    .sort({ ratingAverage: -1, publishedAt: -1, _id: 1 })
    .limit(limit)
    .lean();

  return (related as ProductDoc[]).map(toSummary);
};

export const getNavigation = async (): Promise<CategoryTreeNode[]> => {
  const categories = await CategoryModel.find({ isVisible: true })
    .sort({ position: 1, name: 1 })
    .lean();

  const counts = await ProductModel.aggregate<{ _id: string; count: number }>([
    { $match: { status: 'active' } },
    { $unwind: '$categoryIds' },
    { $group: { _id: '$categoryIds', count: { $sum: 1 } } },
  ]);

  /**
   * Counts roll UP the tree.
   *
   * Products are filed against leaf categories, so a raw count leaves every
   * parent reading "Women (0)" while its children hold the whole catalogue. Each
   * category contributes to itself and to every ancestor on its path.
   */
  const directCount = new Map(counts.map((entry) => [entry._id, entry.count]));
  const countById = new Map<string, number>();
  for (const doc of categories) {
    const direct = directCount.get(doc._id) ?? 0;
    if (direct === 0) continue;
    for (const id of [...doc.path, doc._id]) {
      countById.set(id, (countById.get(id) ?? 0) + direct);
    }
  }

  const nodes = new Map<string, CategoryTreeNode>(
    categories.map((doc) => [
      doc._id,
      { ...toCategoryView(doc, countById.get(doc._id) ?? 0), children: [] },
    ]),
  );

  const roots: CategoryTreeNode[] = [];
  for (const doc of categories) {
    const node = nodes.get(doc._id)!;
    const parent = doc.parentId ? nodes.get(doc.parentId) : undefined;
    // A category whose parent is hidden is promoted to a root rather than
    // dropped: hiding one node should not silently delete a whole branch of the
    // menu.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
};
