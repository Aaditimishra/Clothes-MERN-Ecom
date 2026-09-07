import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG_SORTS } from '@shop/shared';

import { ProductCard } from '../../components/ProductCard';
import { useListing } from '../../lib/catalog';
import { FilterPanel, priceBandLabel } from './FilterPanel';
import { MULTI_KEYS, useListingParams, type MultiKey } from './useListingParams';

const SORT_LABELS: Record<string, string> = {
  relevance: 'Recommended',
  newest: 'New in',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  discount: 'Biggest discount',
  rating: 'Best rated',
};

export const ListingPage = () => {
  const { params, update, toggle, clearAll, activeCount } = useListingParams();
  const { data, isLoading, isFetching, isError, error } = useListing(params);
  const [isFilterOpen, setFilterOpen] = useState(false);

  // The filter sheet is a full-screen overlay on mobile, so the page behind it
  // must not scroll while it is open.
  useEffect(() => {
    if (!isFilterOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFilterOpen]);

  const heading =
    data?.category?.name ??
    (params.search ? `Results for “${params.search}”` : 'All clothing');

  const activeChips = [
    ...MULTI_KEYS.flatMap((key) =>
      (params[key] ?? []).map((value) => {
        const facet = data?.facets.find((entry) => entry.code === key);
        const label = facet?.values.find((entry) => entry.value === value)?.label ?? value;
        return { key: `${key}:${value}`, label, onClear: () => toggle(key as MultiKey, value) };
      }),
    ),
    ...(params.minPrice !== undefined || params.maxPrice !== undefined
      ? [
          {
            key: 'price',
            label: priceBandLabel(params.minPrice, params.maxPrice),
            onClear: () => update({ minPrice: undefined, maxPrice: undefined }),
          },
        ]
      : []),
  ];

  return (
    <div className="shell listing">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{heading}</span>
      </nav>

      <header className="listing-head">
        <div>
          <h1 className="section-title">{heading}</h1>
          <p className="muted">
            {isLoading ? 'Loading…' : `${data?.total ?? 0} item${data?.total === 1 ? '' : 's'}`}
            {data?.category?.description ? ` · ${data.category.description}` : ''}
          </p>
        </div>

        <div className="listing-controls">
          <button
            type="button"
            className="btn btn-outline listing-filter-btn"
            onClick={() => setFilterOpen(true)}
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>

          <label className="sort">
            <span className="sr-only">Sort by</span>
            <select
              value={params.sort ?? 'relevance'}
              onChange={(event) => update({ sort: event.target.value })}
            >
              {CATALOG_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort] ?? sort}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {activeChips.length > 0 ? (
        <div className="active-filters">
          {activeChips.map((chip) => (
            <button key={chip.key} type="button" className="chip is-active" onClick={chip.onClear}>
              {chip.label} <span aria-hidden="true">×</span>
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button type="button" className="link-btn" onClick={clearAll}>
            Clear all
          </button>
        </div>
      ) : null}

      <div className="listing-body">
        <aside
          className={`listing-aside${isFilterOpen ? ' is-open' : ''}`}
          aria-label="Filters"
        >
          <div className="listing-aside-head">
            <strong>Filters</strong>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setFilterOpen(false)}
              aria-label="Close filters"
            >
              ×
            </button>
          </div>

          <FilterPanel
            facets={data?.facets ?? []}
            params={params}
            onToggle={toggle}
            onUpdate={update}
          />

          <div className="listing-aside-foot">
            <button type="button" className="btn btn-outline btn-block" onClick={clearAll}>
              Clear all
            </button>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setFilterOpen(false)}
            >
              Show {data?.total ?? 0} items
            </button>
          </div>
        </aside>

        <section className="listing-results">
          {isError ? (
            <div className="notice notice-error">
              {error instanceof Error ? error.message : 'Could not load these products.'}
            </div>
          ) : null}

          {/* Dimmed rather than replaced while refetching: the grid keeps its
              height, so nothing under the cursor moves mid-click. */}
          <div className={`grid grid-4${isFetching && !isLoading ? ' is-busy' : ''}`}>
            {isLoading
              ? Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="card-skeleton">
                    <div className="skeleton" style={{ aspectRatio: '3 / 4' }} />
                    <div className="skeleton" style={{ height: 12, width: '40%' }} />
                    <div className="skeleton" style={{ height: 14, width: '75%' }} />
                  </div>
                ))
              : data?.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
          </div>

          {!isLoading && data?.items.length === 0 ? (
            <div className="empty-state">
              <h2>Nothing matches those filters</h2>
              <p className="muted">
                Try removing a filter, or browse everything in this category.
              </p>
              <button type="button" className="btn btn-primary" onClick={clearAll}>
                Clear filters
              </button>
            </div>
          ) : null}

          {data && data.pageCount > 1 ? (
            <nav className="pager" aria-label="Pagination">
              <button
                type="button"
                className="btn btn-outline"
                disabled={data.page <= 1}
                onClick={() => update({ page: data.page - 1 }, false)}
              >
                Previous
              </button>
              <span className="muted">
                Page {data.page} of {data.pageCount}
              </span>
              <button
                type="button"
                className="btn btn-outline"
                disabled={data.page >= data.pageCount}
                onClick={() => update({ page: data.page + 1 }, false)}
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
      </div>

      {isFilterOpen ? (
        <div className="listing-scrim" onClick={() => setFilterOpen(false)} aria-hidden="true" />
      ) : null}
    </div>
  );
};
