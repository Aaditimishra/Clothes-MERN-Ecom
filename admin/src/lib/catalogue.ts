import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import type { AdminCategory, SizeChartView, TaxonomyTerm } from './types';

/**
 * Everything the product editor needs to render its dropdowns.
 *
 * Loaded once and cached: the vocabulary, the category tree and the size charts
 * are the same for every product, and re-fetching them per product would make
 * opening the editor three requests slower for no gain.
 */
export const useCatalogueMeta = () => {
  const taxonomy = useQuery({
    queryKey: ['taxonomy', 'all'],
    queryFn: () => api<TaxonomyTerm[]>('/taxonomy'),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<AdminCategory[]>('/categories'),
    staleTime: 5 * 60 * 1000,
  });

  const sizeCharts = useQuery({
    queryKey: ['size-charts'],
    queryFn: () => api<SizeChartView[]>('/size-charts'),
    staleTime: 5 * 60 * 1000,
  });

  const terms = (group: string): TaxonomyTerm[] =>
    (taxonomy.data ?? []).filter((term) => term.group === group && term.isActive);

  return {
    isLoading: taxonomy.isLoading || categories.isLoading || sizeCharts.isLoading,
    terms,
    categories: categories.data ?? [],
    sizeCharts: sizeCharts.data ?? [],
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
