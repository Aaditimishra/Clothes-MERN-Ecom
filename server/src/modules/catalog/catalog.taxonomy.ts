/**
 * The shop's controlled vocabulary.
 *
 * Colours, fabrics and fits are declared here ONCE and referenced by code
 * everywhere else. The alternative — letting each product carry its own label
 * and hex — produces a filter panel with "Navy", "navy blue" and "Nvy" as three
 * separate options, each matching a third of the stock. A closed vocabulary is
 * what makes faceted search trustworthy.
 *
 * Adding a colour is a one-line edit here; nothing else in the engine changes.
 */
export interface TaxonomyTerm {
  readonly code: string;
  readonly label: string;
}

export interface ColourTerm extends TaxonomyTerm {
  /** Rendered as the swatch dot. Chosen to read against both themes. */
  readonly swatch: string;
}

export const COLOURS: readonly ColourTerm[] = [
  { code: 'black', label: 'Black', swatch: '#16161a' },
  { code: 'charcoal', label: 'Charcoal', swatch: '#3f4247' },
  { code: 'white', label: 'White', swatch: '#fbfbfa' },
  { code: 'ivory', label: 'Ivory', swatch: '#f4efe6' },
  { code: 'oatmeal', label: 'Oatmeal', swatch: '#ddd2bf' },
  { code: 'stone', label: 'Stone', swatch: '#c3b8a8' },
  { code: 'khaki', label: 'Khaki', swatch: '#b09a6f' },
  { code: 'tan', label: 'Tan', swatch: '#9c6b4a' },
  { code: 'olive', label: 'Olive', swatch: '#5c6444' },
  { code: 'rust', label: 'Rust', swatch: '#8f4023' },
  { code: 'coral', label: 'Coral', swatch: '#e8735a' },
  { code: 'scarlet', label: 'Scarlet', swatch: '#c0392b' },
  { code: 'cherry', label: 'Cherry', swatch: '#9b1b30' },
  { code: 'maroon', label: 'Maroon', swatch: '#6d1f2c' },
  { code: 'berry', label: 'Berry', swatch: '#7d2b4e' },
  { code: 'blush', label: 'Blush', swatch: '#e3c0bb' },
  { code: 'lilac', label: 'Lilac', swatch: '#b3a4cd' },
  { code: 'sky', label: 'Sky', swatch: '#9dc4e0' },
  { code: 'powder-blue', label: 'Powder Blue', swatch: '#a8c4dd' },
  { code: 'light-wash', label: 'Light Wash', swatch: '#a9c3dd' },
  { code: 'denim-blue', label: 'Denim Blue', swatch: '#4a6f96' },
  { code: 'indigo', label: 'Indigo', swatch: '#3b4a6b' },
  { code: 'navy', label: 'Navy', swatch: '#1f2d44' },
];

export const FABRICS: readonly TaxonomyTerm[] = [
  { code: 'cotton', label: 'Cotton' },
  { code: 'linen', label: 'Linen' },
  { code: 'silk', label: 'Silk' },
  { code: 'wool', label: 'Wool' },
  { code: 'denim', label: 'Denim' },
  { code: 'viscose', label: 'Viscose' },
  { code: 'modal', label: 'Modal' },
  { code: 'blend', label: 'Blend' },
];

export const FITS: readonly TaxonomyTerm[] = [
  { code: 'slim', label: 'Slim' },
  { code: 'regular', label: 'Regular' },
  { code: 'relaxed', label: 'Relaxed' },
  { code: 'oversized', label: 'Oversized' },
  { code: 'bodycon', label: 'Bodycon' },
  { code: 'a-line', label: 'A-line' },
];

export const OCCASIONS: readonly TaxonomyTerm[] = [
  { code: 'everyday', label: 'Everyday' },
  { code: 'work', label: 'Workwear' },
  { code: 'party', label: 'Party' },
  { code: 'festive', label: 'Festive' },
  { code: 'vacation', label: 'Vacation' },
  { code: 'lounge', label: 'Lounge' },
];

export const PATTERNS: readonly TaxonomyTerm[] = [
  { code: 'solid', label: 'Solid' },
  { code: 'floral', label: 'Floral' },
  { code: 'printed', label: 'Printed' },
  { code: 'textured', label: 'Textured' },
];

export const SLEEVE_LENGTHS: readonly TaxonomyTerm[] = [
  { code: 'sleeveless', label: 'Sleeveless' },
  { code: 'short', label: 'Short sleeve' },
  { code: 'three-quarter', label: 'Three-quarter' },
  { code: 'full', label: 'Full sleeve' },
];

const indexBy = <T extends TaxonomyTerm>(terms: readonly T[]): ReadonlyMap<string, T> =>
  new Map(terms.map((term) => [term.code, term]));

export const COLOUR_BY_CODE = indexBy(COLOURS);
export const FABRIC_BY_CODE = indexBy(FABRICS);
export const FIT_BY_CODE = indexBy(FITS);
export const OCCASION_BY_CODE = indexBy(OCCASIONS);

/** Falls back to the raw code so an unknown term is visible, not invisible. */
export const labelFor = (
  registry: ReadonlyMap<string, TaxonomyTerm>,
  code: string,
): string => registry.get(code)?.label ?? code;

export const swatchFor = (code: string): string =>
  COLOUR_BY_CODE.get(code)?.swatch ?? '#cbd5e1';
