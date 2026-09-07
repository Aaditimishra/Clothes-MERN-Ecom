import { formatMoney, money, type CatalogFacet } from '@shop/shared';

import type { MultiKey } from './useListingParams';
import type { ListingParams } from '../../lib/catalog';

/** Fixed bands, not a slider: bands are tappable, shareable and need no drag. */
const PRICE_BANDS = [
  { label: 'Under ₹1,500', min: 0, max: 149_900 },
  { label: '₹1,500 – ₹2,500', min: 150_000, max: 250_000 },
  { label: '₹2,500 – ₹4,000', min: 250_000, max: 400_000 },
  { label: 'Over ₹4,000', min: 400_000, max: undefined },
] as const;

interface FilterPanelProps {
  facets: CatalogFacet[];
  params: ListingParams;
  onToggle: (key: MultiKey, value: string) => void;
  onUpdate: (patch: Record<string, string | number | undefined>) => void;
}

export const FilterPanel = ({ facets, params, onToggle, onUpdate }: FilterPanelProps) => {
  const isBandActive = (band: (typeof PRICE_BANDS)[number]) =>
    params.minPrice === band.min && params.maxPrice === band.max;

  return (
    <div className="filters">
      <details open>
        <summary>Price</summary>
        <div className="filter-body">
          {PRICE_BANDS.map((band) => (
            <label key={band.label} className="check">
              <input
                type="checkbox"
                checked={isBandActive(band)}
                onChange={() =>
                  onUpdate(
                    isBandActive(band)
                      ? { minPrice: undefined, maxPrice: undefined }
                      : { minPrice: band.min, maxPrice: band.max },
                  )
                }
              />
              <span>{band.label}</span>
            </label>
          ))}
        </div>
      </details>

      {facets.map((facet) => {
        const selected = params[facet.code as MultiKey] ?? [];

        return (
          <details key={facet.code} open={facet.type !== 'list' || selected.length > 0}>
            <summary>
              {facet.label}
              {selected.length > 0 ? (
                <span className="filter-count">{selected.length}</span>
              ) : null}
            </summary>

            <div className={`filter-body filter-body-${facet.type}`}>
              {facet.values.map((value) => {
                const isActive = selected.includes(value.value);

                if (facet.type === 'swatch') {
                  return (
                    <button
                      key={value.value}
                      type="button"
                      className={`swatch swatch-sm${isActive ? ' is-active' : ''}`}
                      style={{ '--swatch': value.swatch } as React.CSSProperties}
                      onClick={() => onToggle(facet.code as MultiKey, value.value)}
                      aria-pressed={isActive}
                      title={`${value.label} (${value.count})`}
                      aria-label={`${value.label}, ${value.count} items`}
                    />
                  );
                }

                if (facet.type === 'chip') {
                  return (
                    <button
                      key={value.value}
                      type="button"
                      className={`chip${isActive ? ' is-active' : ''}`}
                      onClick={() => onToggle(facet.code as MultiKey, value.value)}
                      aria-pressed={isActive}
                    >
                      {value.label}
                    </button>
                  );
                }

                return (
                  <label key={value.value} className="check">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => onToggle(facet.code as MultiKey, value.value)}
                    />
                    <span>{value.label}</span>
                    {/* The count is what makes a facet worth having: it tells the
                        shopper whether a filter is worth applying before they
                        apply it and land on an empty grid. */}
                    <span className="muted filter-value-count">{value.count}</span>
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
};

export const priceBandLabel = (
  min: number | undefined,
  max: number | undefined,
): string => {
  const band = PRICE_BANDS.find((entry) => entry.min === min && entry.max === max);
  if (band) return band.label;
  if (min !== undefined && max !== undefined) {
    return `${formatMoney(money(min))} – ${formatMoney(money(max))}`;
  }
  return 'Price';
};
