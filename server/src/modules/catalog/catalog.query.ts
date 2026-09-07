import { z } from 'zod';
import { CATALOG_SORTS, DEPARTMENTS, SIZES } from '@shop/shared';

/** Repeated query params arrive as a string or an array; normalise to an array. */
const csvList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return [] as string[];
    const raw = Array.isArray(value) ? value : value.split(',');
    return [...new Set(raw.map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  });

export const PAGE_SIZE = 24;

export const catalogQuerySchema = z.object({
  category: z.string().trim().toLowerCase().optional(),
  search: z.string().trim().max(120).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  size: csvList,
  colour: csvList,
  brand: csvList,
  fabric: csvList,
  fit: csvList,
  occasion: csvList,
  /** Minor units, so the client never sends a float. */
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(CATALOG_SORTS).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(PAGE_SIZE),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

/** The facet dimensions a shopper can filter on, in the order they render. */
export const FACET_KEYS = [
  'size',
  'colour',
  'brand',
  'fabric',
  'fit',
  'occasion',
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const isKnownSize = (value: string): boolean =>
  (SIZES as readonly string[]).includes(value);
