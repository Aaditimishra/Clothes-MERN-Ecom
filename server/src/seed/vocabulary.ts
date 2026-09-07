import type { TaxonomyGroup } from '../models/taxonomy.model';

export interface SeedTerm {
  code: string;
  label: string;
  swatch?: string;
}

/**
 * The vocabulary the shop starts with.
 *
 * This is a STARTING POINT, not the source of truth — once seeded it lives in
 * the database and the admin owns it. Nothing in the engine reads this file at
 * runtime; deleting it after the first seed would change nothing about how the
 * shop behaves.
 */
export const SEED_VOCABULARY: Record<TaxonomyGroup, SeedTerm[]> = {
  colour: [
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
  ],
  // Sizes are ordered by `position`, never alphabetically — a selector reading
  // `L, M, S, XL` looks broken to every shopper.
  size: [
    { code: 'xs', label: 'XS' },
    { code: 's', label: 'S' },
    { code: 'm', label: 'M' },
    { code: 'l', label: 'L' },
    { code: 'xl', label: 'XL' },
    { code: 'xxl', label: 'XXL' },
    { code: 'xxxl', label: 'XXXL' },
  ],
  brand: [
    { code: 'threadline', label: 'Threadline' },
    { code: 'atelier-nine', label: 'Atelier Nine' },
    { code: 'noor-studio', label: 'Noor Studio' },
    { code: 'sutra-co', label: 'Sutra & Co' },
    { code: 'mercer-denim', label: 'Mercer Denim' },
  ],
  fabric: [
    { code: 'cotton', label: 'Cotton' },
    { code: 'linen', label: 'Linen' },
    { code: 'silk', label: 'Silk' },
    { code: 'wool', label: 'Wool' },
    { code: 'denim', label: 'Denim' },
    { code: 'viscose', label: 'Viscose' },
    { code: 'modal', label: 'Modal' },
    { code: 'blend', label: 'Blend' },
  ],
  fit: [
    { code: 'slim', label: 'Slim' },
    { code: 'regular', label: 'Regular' },
    { code: 'relaxed', label: 'Relaxed' },
    { code: 'oversized', label: 'Oversized' },
    { code: 'bodycon', label: 'Bodycon' },
    { code: 'a-line', label: 'A-line' },
  ],
  occasion: [
    { code: 'everyday', label: 'Everyday' },
    { code: 'work', label: 'Workwear' },
    { code: 'party', label: 'Party' },
    { code: 'festive', label: 'Festive' },
    { code: 'vacation', label: 'Vacation' },
    { code: 'lounge', label: 'Lounge' },
  ],
  'sleeve-length': [
    { code: 'sleeveless', label: 'Sleeveless' },
    { code: 'short', label: 'Short sleeve' },
    { code: 'three-quarter', label: 'Three-quarter' },
    { code: 'full', label: 'Full sleeve' },
  ],
  pattern: [
    { code: 'solid', label: 'Solid' },
    { code: 'floral', label: 'Floral' },
    { code: 'printed', label: 'Printed' },
    { code: 'textured', label: 'Textured' },
    { code: 'striped', label: 'Striped' },
    { code: 'checked', label: 'Checked' },
  ],
  neckline: [
    { code: 'crew', label: 'Crew' },
    { code: 'v-neck', label: 'V-neck' },
    { code: 'scoop', label: 'Scoop' },
    { code: 'collared', label: 'Collared' },
    { code: 'mock-neck', label: 'Mock neck' },
    { code: 'off-shoulder', label: 'Off-shoulder' },
    { code: 'cowl', label: 'Cowl' },
  ],
  department: [
    { code: 'women', label: 'Women' },
    { code: 'men', label: 'Men' },
    { code: 'unisex', label: 'Unisex' },
    { code: 'kids', label: 'Kids' },
  ],
};

/** Charts a merchant can edit; products reference them by id. */
export const SEED_SIZE_CHARTS = [
  {
    key: 'womens-tops',
    name: "Women's tops & dresses",
    unit: 'cm',
    note: 'Garment measurements. If you are between sizes, size up for a relaxed fit.',
    columns: [
      { code: 'bust', label: 'Bust' },
      { code: 'waist', label: 'Waist' },
      { code: 'hip', label: 'Hip' },
      { code: 'length', label: 'Length' },
    ],
    rows: [
      { size: 'xs', values: { bust: 82, waist: 64, hip: 88, length: 88 } },
      { size: 's', values: { bust: 86, waist: 68, hip: 92, length: 89 } },
      { size: 'm', values: { bust: 91, waist: 73, hip: 97, length: 90 } },
      { size: 'l', values: { bust: 97, waist: 79, hip: 103, length: 91 } },
      { size: 'xl', values: { bust: 104, waist: 86, hip: 110, length: 92 } },
    ],
  },
  {
    key: 'womens-bottoms',
    name: "Women's trousers",
    unit: 'cm',
    note: 'Waist is measured flat and doubled. Inseam is unhemmed.',
    columns: [
      { code: 'waist', label: 'Waist' },
      { code: 'hip', label: 'Hip' },
      { code: 'inseam', label: 'Inseam' },
    ],
    rows: [
      { size: 'xs', values: { waist: 64, hip: 88, inseam: 74 } },
      { size: 's', values: { waist: 68, hip: 92, inseam: 75 } },
      { size: 'm', values: { waist: 73, hip: 97, inseam: 76 } },
      { size: 'l', values: { waist: 79, hip: 103, inseam: 77 } },
      { size: 'xl', values: { waist: 86, hip: 110, inseam: 78 } },
    ],
  },
  {
    key: 'mens-tops',
    name: "Men's shirts & tees",
    unit: 'cm',
    note: 'Chest is measured flat across and doubled.',
    columns: [
      { code: 'chest', label: 'Chest' },
      { code: 'shoulder', label: 'Shoulder' },
      { code: 'length', label: 'Length' },
      { code: 'sleeve', label: 'Sleeve' },
    ],
    rows: [
      { size: 's', values: { chest: 96, shoulder: 43, length: 69, sleeve: 61 } },
      { size: 'm', values: { chest: 101, shoulder: 45, length: 71, sleeve: 62 } },
      { size: 'l', values: { chest: 107, shoulder: 47, length: 73, sleeve: 64 } },
      { size: 'xl', values: { chest: 114, shoulder: 49, length: 75, sleeve: 65 } },
      { size: 'xxl', values: { chest: 122, shoulder: 51, length: 77, sleeve: 66 } },
    ],
  },
  {
    key: 'mens-bottoms',
    name: "Men's trousers & jeans",
    unit: 'cm',
    note: 'Sizes are labelled S–XXL; the waist measurement is the one to trust.',
    columns: [
      { code: 'waist', label: 'Waist' },
      { code: 'hip', label: 'Hip' },
      { code: 'inseam', label: 'Inseam' },
      { code: 'thigh', label: 'Thigh' },
    ],
    rows: [
      { size: 's', values: { waist: 76, hip: 96, inseam: 79, thigh: 56 } },
      { size: 'm', values: { waist: 81, hip: 101, inseam: 80, thigh: 58 } },
      { size: 'l', values: { waist: 86, hip: 106, inseam: 81, thigh: 60 } },
      { size: 'xl', values: { waist: 94, hip: 113, inseam: 82, thigh: 63 } },
      { size: 'xxl', values: { waist: 102, hip: 120, inseam: 83, thigh: 66 } },
    ],
  },
] as const;
