import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ListingParams } from '../../lib/catalog';

/** Facet dimensions, which are multi-select and travel as comma-separated lists. */
export const MULTI_KEYS = [
  'size',
  'colour',
  'brand',
  'fabric',
  'fit',
  'occasion',
] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];

/**
 * The URL is the state.
 *
 * Filters live in the query string rather than in component state so a filtered
 * view can be shared, bookmarked, and reached again with the back button. Holding
 * them in `useState` would make every one of those silently lose the shopper's
 * selection — and back-from-a-product is the most common move on a listing page.
 */
export const useListingParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<ListingParams>(() => {
    const listRead = (key: MultiKey): string[] => {
      const raw = searchParams.get(key);
      return raw ? raw.split(',').filter(Boolean) : [];
    };

    const numberRead = (key: string): number | undefined => {
      const raw = searchParams.get(key);
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    return {
      category: searchParams.get('category') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
      page: numberRead('page') ?? 1,
      minPrice: numberRead('minPrice'),
      maxPrice: numberRead('maxPrice'),
      ...Object.fromEntries(MULTI_KEYS.map((key) => [key, listRead(key)])),
    };
  }, [searchParams]);

  const update = useCallback(
    (patch: Record<string, string | string[] | number | undefined>, resetPage = true) => {
      const next = new URLSearchParams(searchParams);

      for (const [key, value] of Object.entries(patch)) {
        const isEmpty =
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && value.length === 0);

        if (isEmpty) next.delete(key);
        else next.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }

      // Changing any filter returns to page 1. Staying on page 4 of a result set
      // that now has two pages shows an empty grid and looks like a bug.
      if (resetPage) next.delete('page');

      setSearchParams(next, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  /** Adds or removes one value from a multi-select facet. */
  const toggle = useCallback(
    (key: MultiKey, value: string) => {
      const current = params[key] ?? [];
      update({
        [key]: current.includes(value)
          ? current.filter((entry) => entry !== value)
          : [...current, value],
      });
    },
    [params, update],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams();
    // Category and search survive a "clear filters": they are what the shopper
    // is browsing, not a filter they applied on top of it.
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    if (category) next.set('category', category);
    if (search) next.set('search', search);
    setSearchParams(next, { preventScrollReset: true });
  }, [searchParams, setSearchParams]);

  const activeCount = MULTI_KEYS.reduce(
    (total, key) => total + (params[key]?.length ?? 0),
    0,
  ) + (params.minPrice !== undefined || params.maxPrice !== undefined ? 1 : 0);

  return { params, update, toggle, clearAll, activeCount };
};
