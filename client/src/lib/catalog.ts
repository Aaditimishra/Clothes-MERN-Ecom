import { useQuery } from '@tanstack/react-query';
import type {
  CatalogListingResponse,
  ProductDetailView,
  ProductSummaryView,
} from '@shop/shared';

import { request, toQueryString } from './api';

export interface ListingParams {
  category?: string;
  search?: string;
  size?: string[];
  colour?: string[];
  brand?: string[];
  fabric?: string[];
  fit?: string[];
  occasion?: string[];
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export const useListing = (params: ListingParams) =>
  useQuery({
    // The params object IS the cache key. Two shoppers on the same filtered view
    // share a cache entry, and going back to a previous filter is instant.
    queryKey: ['listing', params],
    queryFn: () =>
      request<CatalogListingResponse>(`/catalog/products${toQueryString({ ...params })}`),
    // Keeps the previous page on screen while the next loads, so changing a
    // filter dims the grid instead of collapsing it to a spinner.
    placeholderData: (previous) => previous,
  });

export const useProduct = (slug: string | undefined) =>
  useQuery({
    queryKey: ['product', slug],
    queryFn: () => request<ProductDetailView>(`/catalog/products/${slug}`),
    enabled: Boolean(slug),
  });

export const useRelated = (slug: string | undefined) =>
  useQuery({
    queryKey: ['related', slug],
    queryFn: () => request<ProductSummaryView[]>(`/catalog/products/${slug}/related`),
    enabled: Boolean(slug),
  });
