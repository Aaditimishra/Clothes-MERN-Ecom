import { useQuery } from '@tanstack/react-query';

import { api, query } from './api';
import type { AdminCategory, Paged, SizeChartView, TaxonomyTerm } from './types';

/**
 * The editor's pickers need the WHOLE vocabulary, not a page of it.
 *
 * These lists became paged for the screens that browse them, and a dropdown
 * that silently offers the first twenty-five colours is worse than one that is
 * slow: the missing ones cannot be chosen and nothing says why. The lists are
 * bounded by what a shop can sensibly have, so asking for the maximum once and
 * caching it is the right trade here.
 */
const ALL = { page: 1, pageSize: 100 };

/**
 * Everything the product editor needs to render its dropdowns.
 *
 * Loaded once and cached: the vocabulary, the category tree and the size charts
 * are the same for every product, and re-fetching them per product would make
 * opening the editor three requests slower for no gain.
 */
export const useCatalogueMeta = () => {
  const taxonomy = useQuery({
    // A distinct key from the Attributes screen's paged query — that one holds
    // one group at a time, this one holds everything, and sharing a key would
    // have them overwrite each other.
    queryKey: ['taxonomy', 'all'],
    queryFn: () => api<Paged<TaxonomyTerm>>(`/taxonomy${query(ALL)}`),
    staleTime: 5 * 60 * 1000,
  });

  // Categories are a tree and are deliberately NOT paged — a page boundary
  // through a tree separates parents from their children.
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<AdminCategory[]>('/categories'),
    staleTime: 5 * 60 * 1000,
  });

  const sizeCharts = useQuery({
    queryKey: ['size-charts', 'all'],
    queryFn: () => api<Paged<SizeChartView>>(`/size-charts${query(ALL)}`),
    staleTime: 5 * 60 * 1000,
  });

  const terms = (group: string): TaxonomyTerm[] =>
    (taxonomy.data?.items ?? []).filter((term) => term.group === group && term.isActive);

  return {
    isLoading: taxonomy.isLoading || categories.isLoading || sizeCharts.isLoading,
    terms,
    categories: categories.data ?? [],
    sizeCharts: sizeCharts.data?.items ?? [],
  };
};

/** "Women › Dresses", so a flat `<select>` still reads as a tree. */
export const categoryLabel = (
  category: AdminCategory,
  all: AdminCategory[],
): string => {
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const trail = category.path.flatMap((id) => {
    const parent = byId.get(id);
    return parent ? [parent.name] : [];
  });

  return [...trail, category.name].join(' › ');
};
