import type { Size } from '@shop/shared';

/**
 * The demo catalogue.
 *
 * Data, not code — adding a garment is an entry here and nothing else; no engine
 * file knows that "Printed Tea Dress" exists.
 *
 * Every colourway names its OWN photographs. That is the whole point of the
 * shape: a swatch labelled "Berry" must open a gallery of the berry colourway,
 * not a shared pool of images picked by index. Letting the seed guess which
 * photo belongs to which colour is how a shop ends up showing a blue shirt under
 * a swatch marked white.
 */
export interface SeedCategory {
  slug: string;
  name: string;
  description?: string;
  department?: string;
  parent?: string;
}

export interface SeedColourway {
  code: string;
  /** Unsplash photo ids for THIS colourway, lead image first. */
  photos: string[];
}

export interface SeedProduct {
  slug: string;
  name: string;
  brand: string;
  department: 'women' | 'men' | 'kids' | 'unisex';
  category: string;
  description: string;
  highlights: string[];
  careInstructions: string;
  fabric: string;
  fit: string;
  sleeveLength?: string;
  occasion: string;
  pattern?: string;
  neckline?: string;
  /** Major rupees; converted to integer minor units on write. */
  price: number;
  /** Struck-through MRP. Omit for a full-price line. */
  compareAt?: number;
  colourways: SeedColourway[];
  sizes: Size[];
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { slug: 'women', name: 'Women', department: 'women', description: 'Everything for her.' },
  { slug: 'men', name: 'Men', department: 'men', description: 'Everything for him.' },

  { slug: 'dresses', name: 'Dresses', parent: 'women', department: 'women' },
  { slug: 'tops', name: 'Tops & Shirts', parent: 'women', department: 'women' },
  { slug: 'knitwear', name: 'Knitwear', parent: 'women', department: 'women' },
  { slug: 'womens-bottoms', name: 'Trousers', parent: 'women', department: 'women' },
  { slug: 'womens-outerwear', name: 'Coats & Jackets', parent: 'women', department: 'women' },

  { slug: 'shirts', name: 'Shirts', parent: 'men', department: 'men' },
  { slug: 'tees', name: 'T-Shirts', parent: 'men', department: 'men' },
  { slug: 'mens-bottoms', name: 'Trousers & Jeans', parent: 'men', department: 'men' },
  { slug: 'mens-outerwear', name: 'Jackets', parent: 'men', department: 'men' },
];

const W: Size[] = ['xs', 's', 'm', 'l', 'xl'];
const M: Size[] = ['s', 'm', 'l', 'xl', 'xxl'];

export const SEED_PRODUCTS: SeedProduct[] = [
  /* ------------------------------- women ------------------------------- */
  {
    slug: 'off-shoulder-jersey-midi-dress',
    name: 'Off-Shoulder Jersey Midi Dress',
    brand: 'Threadline',
    department: 'women',
    category: 'dresses',
    description:
      'A clean off-shoulder neckline over a body-skimming jersey column. It holds ' +
      'its shape through the day and reads as considered with nothing more than ' +
      'flat sandals.',
    highlights: ['Off-shoulder neckline', 'Heavy stretch jersey', 'Midi length', 'Fully lined'],
    careInstructions: 'Hand wash cold. Dry flat in shade. Do not tumble dry.',
    fabric: 'viscose',
    fit: 'bodycon',
    sleeveLength: 'sleeveless',
    occasion: 'party',
    pattern: 'solid',
    neckline: 'off-shoulder',
    price: 2499,
    compareAt: 3299,
    colourways: [
      { code: 'berry', photos: ['1566174053879-31528523f8ae'] },
      { code: 'ivory', photos: ['1515372039744-b8f02a3ae446'] },
    ],
    sizes: W,
  },
  {
    slug: 'printed-tea-dress',
    name: 'Printed Tea Dress',
    brand: 'Atelier Nine',
    department: 'women',
    category: 'dresses',
    description:
      'A full-skirted tea dress cut to sit at the natural waist. The print is ' +
      'placed, not repeated at random, so the pattern falls where it should.',
    highlights: ['Placed print', 'Defined waist', 'Full skirt', 'Side pockets'],
    careInstructions: 'Machine wash cold on gentle. Warm iron on the reverse.',
    fabric: 'viscose',
    fit: 'a-line',
    sleeveLength: 'short',
    occasion: 'everyday',
    pattern: 'floral',
    neckline: 'v-neck',
    price: 2899,
    compareAt: 3799,
    colourways: [
      { code: 'cherry', photos: ['1572804013309-59a88b7e92f1'] },
      { code: 'maroon', photos: ['1502716119720-b23a93e5fe1b'] },
      { code: 'ivory', photos: ['1496747611176-843222e1e57c'] },
    ],
    sizes: W,
  },
  {
    slug: 'bias-cut-satin-gown',
    name: 'Bias Cut Satin Gown',
    brand: 'Noor Studio',
    department: 'women',
    category: 'dresses',
    description:
      'Cut on the bias so it moves with you. A fluid satin floor-length gown that ' +
      'does the work of any jewellery on its own.',
    highlights: ['Bias cut', 'Floor length', 'Fluid satin', 'Fully lined'],
    careInstructions: 'Dry clean only.',
    fabric: 'silk',
    fit: 'regular',
    sleeveLength: 'sleeveless',
    occasion: 'party',
    pattern: 'solid',
    neckline: 'v-neck',
    price: 4499,
    compareAt: 5999,
    colourways: [
      { code: 'scarlet', photos: ['1595777457583-95e059d581b8'] },
      { code: 'powder-blue', photos: ['1539008835657-9e8e9680c956'] },
      { code: 'cherry', photos: ['1612336307429-8a898d10e223'] },
    ],
    sizes: W,
  },
  {
    slug: 'crochet-knit-sundress',
    name: 'Crochet Knit Sundress',
    brand: 'Noor Studio',
    department: 'women',
    category: 'dresses',
    description:
      'An open crochet knit worked in a fine cotton yarn, lined through the body ' +
      'and left sheer at the hem. Made for heat.',
    highlights: ['Open crochet knit', 'Cotton yarn', 'Lined body', 'Sheer hem'],
    careInstructions: 'Hand wash cold. Dry flat. Do not wring.',
    fabric: 'cotton',
    fit: 'relaxed',
    sleeveLength: 'sleeveless',
    occasion: 'vacation',
    pattern: 'textured',
    neckline: 'scoop',
    price: 3299,
    compareAt: 4199,
    colourways: [
      { code: 'ivory', photos: ['1594633313593-bab3825d0caf'] },
      { code: 'indigo', photos: ['1551803091-e20673f15770'] },
    ],
    sizes: W,
  },
  {
    slug: 'crisp-poplin-shirt',
    name: 'Crisp Poplin Shirt',
    brand: 'Atelier Nine',
    department: 'women',
    category: 'tops',
    description:
      'The borrowed-from-him shirt, cut properly for a woman. Dropped shoulder, ' +
      'long tail, and a weave opaque enough to wear on its own.',
    highlights: ['Dropped shoulder', 'Longline hem', 'Opaque weave', 'Mother-of-pearl buttons'],
    careInstructions: 'Machine wash cold. Line dry. Hot iron.',
    fabric: 'cotton',
    fit: 'oversized',
    sleeveLength: 'full',
    occasion: 'work',
    pattern: 'solid',
    neckline: 'collared',
    price: 2099,
    colourways: [
      { code: 'white', photos: ['1603252109303-2751441dd157', '1490481651871-ab68de25d43d'] },
      { code: 'denim-blue', photos: ['1596755094514-f87e34085b2c'] },
    ],
    sizes: W,
  },
  {
    slug: 'cotton-graphic-tee',
    name: 'Cotton Graphic Tee',
    brand: 'Threadline',
    department: 'women',
    category: 'tops',
    description:
      'A soft-washed cotton tee with a screen print that has been through the wash ' +
      'before it reaches you, so it never feels like a sticker.',
    highlights: ['Soft-washed cotton', 'Screen printed', 'Relaxed body', 'Pre-shrunk'],
    careInstructions: 'Machine wash cold inside out. Tumble dry low.',
    fabric: 'cotton',
    fit: 'relaxed',
    sleeveLength: 'short',
    occasion: 'everyday',
    pattern: 'printed',
    neckline: 'crew',
    price: 1299,
    compareAt: 1699,
    colourways: [{ code: 'white', photos: ['1554568218-0f1715e72254'] }],
    sizes: W,
  },
  {
    slug: 'chunky-knit-jumper',
    name: 'Chunky Knit Jumper',
    brand: 'Atelier Nine',
    department: 'women',
    category: 'knitwear',
    description:
      'A substantial knit that layers under a coat without bulk at the shoulder. ' +
      'Ribbed cuffs hold their shape well past the first wash.',
    highlights: ['Chunky gauge', 'Ribbed cuffs and hem', 'Drop shoulder'],
    careInstructions: 'Hand wash cold or wool cycle. Dry flat, never on a hanger.',
    fabric: 'wool',
    fit: 'relaxed',
    sleeveLength: 'full',
    occasion: 'everyday',
    pattern: 'solid',
    neckline: 'crew',
    price: 3499,
    compareAt: 4599,
    colourways: [
      { code: 'oatmeal', photos: ['1509551388413-e18d0ac5d495'] },
      { code: 'stone', photos: ['1516762689617-e1cffcef479d'] },
      { code: 'white', photos: ['1620799140408-edc6dcb6d633'] },
    ],
    sizes: W,
  },
  {
    slug: 'fringed-knit-poncho',
    name: 'Fringed Knit Poncho',
    brand: 'Noor Studio',
    department: 'women',
    category: 'knitwear',
    description:
      'An open-knit poncho with a hand-tied fringe. One size across the shoulders, ' +
      'worn over everything from a tee to a shirt dress.',
    highlights: ['Open knit', 'Hand-tied fringe', 'V neckline', 'One size across the shoulder'],
    careInstructions: 'Hand wash cold. Dry flat. Comb the fringe while damp.',
    fabric: 'blend',
    fit: 'relaxed',
    sleeveLength: 'sleeveless',
    occasion: 'everyday',
    pattern: 'textured',
    neckline: 'v-neck',
    price: 2299,
    colourways: [{ code: 'ivory', photos: ['1434389677669-e08b4cac3105'] }],
    sizes: W,
  },
  {
    slug: 'relaxed-jogger-trouser',
    name: 'Relaxed Jogger Trouser',
    brand: 'Threadline',
    department: 'women',
    category: 'womens-bottoms',
    description:
      'A soft tapered trouser with an elasticated cuff and a drawstring waist. ' +
      'Smart enough to leave the house in, which is more than most joggers manage.',
    highlights: ['Elasticated cuff', 'Drawstring waist', 'Deep side pockets', 'Unlined'],
    careInstructions: 'Machine wash cold. Warm iron.',
    fabric: 'modal',
    fit: 'relaxed',
    occasion: 'lounge',
    pattern: 'solid',
    price: 1899,
    compareAt: 2499,
    colourways: [{ code: 'blush', photos: ['1594633312681-425c7b97ccd1'] }],
    sizes: W,
  },
  {
    slug: 'wool-wrap-coat',
    name: 'Wool Wrap Coat',
    brand: 'Noor Studio',
    department: 'women',
    category: 'womens-outerwear',
    description:
      'A longline wrap coat in a brushed wool blend, with a self belt and no ' +
      'buttons to pull out of shape. Cut generously enough to layer a jumper under.',
    highlights: ['Brushed wool blend', 'Self belt', 'Longline', 'Fully lined'],
    careInstructions: 'Dry clean only. Brush along the nap.',
    fabric: 'wool',
    fit: 'relaxed',
    sleeveLength: 'full',
    occasion: 'work',
    pattern: 'solid',
    neckline: 'collared',
    price: 6499,
    compareAt: 8499,
    colourways: [
      { code: 'blush', photos: ['1485462537746-965f33f7f6a7'] },
      { code: 'maroon', photos: ['1483985988355-763728e1935b'] },
    ],
    sizes: W,
  },
  {
    slug: 'utility-overshirt',
    name: 'Utility Overshirt',
    brand: 'Threadline',
    department: 'women',
    category: 'womens-outerwear',
    description:
      'Half shirt, half jacket, in a washed cotton twill. Four front pockets that ' +
      'are actually deep enough to use.',
    highlights: ['Washed cotton twill', 'Four front pockets', 'Corozo buttons', 'Drop shoulder'],
    careInstructions: 'Machine wash cold on gentle. Do not tumble dry.',
    fabric: 'cotton',
    fit: 'oversized',
    sleeveLength: 'full',
    occasion: 'everyday',
    pattern: 'solid',
    neckline: 'collared',
    price: 3899,
    compareAt: 4999,
    colourways: [{ code: 'olive', photos: ['1544022613-e87ca75a784a'] }],
    sizes: W,
  },

  /* -------------------------------- men -------------------------------- */
  {
    slug: 'oxford-button-down-shirt',
    name: 'Oxford Button Down Shirt',
    brand: 'Sutra & Co',
    department: 'men',
    category: 'shirts',
    description:
      'A proper oxford: substantial cloth, a button-down collar that stands on its ' +
      'own, and a cut that is trim without pulling across the back.',
    highlights: ['Heavyweight oxford cotton', 'Button-down collar', 'Single chest pocket'],
    careInstructions: 'Machine wash warm. Tumble dry low. Hot iron.',
    fabric: 'cotton',
    fit: 'regular',
    sleeveLength: 'full',
    occasion: 'work',
    pattern: 'solid',
    neckline: 'collared',
    price: 2299,
    compareAt: 2999,
    colourways: [
      { code: 'white', photos: ['1621072156002-e2fccdc0b176'] },
      { code: 'sky', photos: ['1620012253295-c15cc3e65df4'] },
      { code: 'lilac', photos: ['1598032895397-b9472444bf93'] },
    ],
    sizes: M,
  },
  {
    slug: 'garment-dyed-cotton-shirt',
    name: 'Garment-Dyed Cotton Shirt',
    brand: 'Sutra & Co',
    department: 'men',
    category: 'shirts',
    description:
      'Dyed after it is sewn, so the seams take the colour slightly differently and ' +
      'no two are quite identical. It will keep softening for years.',
    highlights: ['Garment dyed', 'Pure cotton', 'Relaxed through the body', 'Curved hem'],
    careInstructions: 'Machine wash cold with like colours. Line dry.',
    fabric: 'cotton',
    fit: 'relaxed',
    sleeveLength: 'full',
    occasion: 'everyday',
    pattern: 'solid',
    neckline: 'collared',
    price: 2799,
    colourways: [
      { code: 'maroon', photos: ['1602810318383-e386cc2a3ccf'] },
      { code: 'coral', photos: ['1626497764746-6dc36546b388'] },
    ],
    sizes: M,
  },
  {
    slug: 'heavyweight-cotton-tee',
    name: 'Heavyweight Cotton Tee',
    brand: 'Threadline',
    department: 'unisex',
    category: 'tees',
    description:
      'A 240 gsm tee with a ribbed collar that will not stretch out. Boxy, but not ' +
      'so boxy that it loses its shape.',
    highlights: ['240 gsm cotton', 'Ribbed collar', 'Shoulder-to-shoulder taping', 'Pre-shrunk'],
    careInstructions: 'Machine wash cold. Tumble dry low.',
    fabric: 'cotton',
    fit: 'relaxed',
    sleeveLength: 'short',
    occasion: 'everyday',
    pattern: 'solid',
    neckline: 'crew',
    price: 1199,
    compareAt: 1599,
    colourways: [
      { code: 'white', photos: ['1521572163474-6864f9cf17ab', '1586790170083-2f9ceadc732d'] },
      { code: 'black', photos: ['1583743814966-8936f5b7be1a'] },
      { code: 'lilac', photos: ['1622470953794-aa9c70b0fb9d'] },
    ],
    sizes: M,
  },
  {
    slug: 'printed-cotton-tee',
    name: 'Printed Cotton Tee',
    brand: 'Mercer Denim',
    department: 'men',
    category: 'tees',
    description:
      'A mid-weight tee with a discharge print, so the graphic sits in the cloth ' +
      'rather than on top of it. No cracking, no peeling.',
    highlights: ['Discharge printed', 'Mid-weight cotton', 'Twin-needle hems'],
    careInstructions: 'Machine wash cold inside out. Do not iron the print.',
    fabric: 'cotton',
    fit: 'regular',
    sleeveLength: 'short',
    occasion: 'everyday',
    pattern: 'printed',
    neckline: 'crew',
    price: 1399,
    compareAt: 1799,
    colourways: [
      { code: 'white', photos: ['1571945153237-4929e783af4a'] },
      { code: 'black', photos: ['1618354691373-d851c5c3a990', '1576871337622-98d48d1cf531'] },
    ],
    sizes: M,
  },
  {
    slug: 'tapered-selvedge-jean',
    name: 'Tapered Selvedge Jean',
    brand: 'Mercer Denim',
    department: 'men',
    category: 'mens-bottoms',
    description:
      'Raw selvedge denim with a mid rise and a clean taper below the knee. It will ' +
      'fade to your own shape rather than someone else’s.',
    highlights: ['13.5 oz selvedge denim', 'Mid rise', 'Tapered leg', 'Button fly'],
    careInstructions: 'Wash rarely, cold, inside out. Line dry.',
    fabric: 'denim',
    fit: 'slim',
    occasion: 'everyday',
    pattern: 'solid',
    price: 3999,
    compareAt: 4999,
    colourways: [
      { code: 'indigo', photos: ['1541099649105-f69ad21f3246'] },
      { code: 'black', photos: ['1542272604-787c3835535d'] },
      { code: 'light-wash', photos: ['1604176354204-9268737828e4'] },
    ],
    sizes: M,
  },
  {
    slug: 'pleated-chino-trouser',
    name: 'Pleated Chino Trouser',
    brand: 'Mercer Denim',
    department: 'men',
    category: 'mens-bottoms',
    description:
      'A single forward pleat gives room through the thigh without looking full. ' +
      'Cotton twill with enough weight to hang properly.',
    highlights: ['Single forward pleat', 'Cotton twill', 'Slanted side pockets', 'Unfinished hem'],
    careInstructions: 'Machine wash cold. Warm iron.',
    fabric: 'cotton',
    fit: 'regular',
    occasion: 'work',
    pattern: 'solid',
    price: 2499,
    compareAt: 3199,
    colourways: [
      { code: 'khaki', photos: ['1473966968600-fa801b869a1a'] },
      { code: 'stone', photos: ['1479064555552-3ef4979f8908'] },
    ],
    sizes: M,
  },
  {
    slug: 'denim-trucker-jacket',
    name: 'Denim Trucker Jacket',
    brand: 'Mercer Denim',
    department: 'men',
    category: 'mens-outerwear',
    description:
      'The classic four-pocket trucker in a stonewashed denim that is already soft ' +
      'at the elbow. Cut to sit at the waist, not below it.',
    highlights: ['Stonewashed denim', 'Four pockets', 'Adjustable waist tabs', 'Copper rivets'],
    careInstructions: 'Machine wash cold. Line dry.',
    fabric: 'denim',
    fit: 'regular',
    sleeveLength: 'full',
    occasion: 'everyday',
    pattern: 'solid',
    neckline: 'collared',
    price: 4299,
    compareAt: 5499,
    colourways: [{ code: 'light-wash', photos: ['1551537482-f2075a1d41f2'] }],
    sizes: M,
  },
  {
    slug: 'leather-biker-jacket',
    name: 'Leather Biker Jacket',
    brand: 'Sutra & Co',
    department: 'men',
    category: 'mens-outerwear',
    description:
      'Full-grain leather with an asymmetric zip and a notched lapel. Heavy in the ' +
      'hand, and it will outlast most of what else is in the wardrobe.',
    highlights: ['Full-grain leather', 'Asymmetric zip', 'Notched lapel', 'Quilted lining'],
    careInstructions: 'Wipe with a damp cloth. Condition twice a year. Never machine wash.',
    fabric: 'blend',
    fit: 'slim',
    sleeveLength: 'full',
    occasion: 'everyday',
    pattern: 'solid',
    neckline: 'collared',
    price: 9999,
    compareAt: 12999,
    colourways: [{ code: 'tan', photos: ['1487222477894-8943e31ef7b2'] }],
    sizes: M,
  },
  {
    slug: 'bomber-jacket',
    name: 'Lightweight Bomber Jacket',
    brand: 'Threadline',
    department: 'men',
    category: 'mens-outerwear',
    description:
      'A packable bomber in a matte technical shell, with ribbed cuffs and a hem ' +
      'that sits exactly where it should. Water resistant, not waterproof.',
    highlights: ['Matte technical shell', 'Water resistant', 'Ribbed cuffs and hem', 'Zip pockets'],
    careInstructions: 'Machine wash cold on gentle. Hang dry. Do not iron.',
    fabric: 'blend',
    fit: 'regular',
    sleeveLength: 'full',
    occasion: 'everyday',
    pattern: 'solid',
    neckline: 'crew',
    price: 3499,
    compareAt: 4499,
    colourways: [{ code: 'rust', photos: ['1591047139829-d91aecb6caea'] }],
    sizes: M,
  },
];

/** A price ladder so larger sizes cost a little more, as real apparel does. */
export const priceForSize = (basePrice: number, size: Size): number => {
  const surcharge: Partial<Record<Size, number>> = { xl: 100, xxl: 150, xxxl: 200 };
  return basePrice + (surcharge[size] ?? 0);
};
