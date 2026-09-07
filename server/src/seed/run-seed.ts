import bcrypt from 'bcryptjs';
import { newId, rupees, sizeRank, slugify, type Size } from '@shop/shared';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { CartModel } from '../models/cart.model';
import { CategoryModel } from '../models/category.model';
import { CouponModel } from '../models/coupon.model';
import { CustomerModel } from '../models/customer.model';
import { MediaModel } from '../models/media.model';
import { OrderModel } from '../models/order.model';
import { ProductModel } from '../models/product.model';
import { ReviewModel } from '../models/review.model';
import { SETTINGS_ID, SettingsModel } from '../models/settings.model';
import { SizeChartModel } from '../models/size-chart.model';
import { ROLE_PRESETS, StaffModel } from '../models/staff.model';
import { TaxonomyTermModel, type TaxonomyGroup } from '../models/taxonomy.model';
import { PageModel } from '../models/page.model';
import { PostModel } from '../models/post.model';
import { ResetTokenModel } from '../models/reset-token.model';
import { EmailModel, NotificationModel } from '../models/notification.model';
import { priceForSize, SEED_CATEGORIES, SEED_PRODUCTS, type SeedProduct } from './catalogue';
import { REVIEW_AUTHORS, REVIEW_TEMPLATES } from './reviews';
import { SEED_SIZE_CHARTS, SEED_VOCABULARY } from './vocabulary';
import { SEED_PAGES } from './pages';
import { SEED_POSTS } from './journal';

/**
 * Deterministic pseudo-randomness.
 *
 * Stock levels must look varied but be the SAME on every seed. `Math.random()`
 * would give a different shop each run, so a screenshot, a bug report or a test
 * that depends on "the medium is sold out" would stop matching the next time
 * anyone reseeds.
 */
const seededRandom = (key: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
};

const imageUrl = (photoId: string, width = 900): string =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${width}&q=80`;

/**
 * Stock varies by size in the shape a real shop has: the middle sizes sell out,
 * the ends linger. One combination per product is forced to zero so the sold-out
 * state is always visible somewhere in the demo.
 */
const stockFor = (product: SeedProduct, size: Size, colour: string): number => {
  const roll = seededRandom(`${product.slug}:${size}:${colour}`);
  const isMidSize = size === 'm' || size === 'l';

  if (roll < (isMidSize ? 0.18 : 0.08)) return 0;
  return Math.round(4 + roll * (isMidSize ? 14 : 26));
};

/** Which shared chart a garment uses, derived from where it sits in the shop. */
const chartKeyFor = (product: SeedProduct): string => {
  if (product.category === 'womens-bottoms') return 'womens-bottoms';
  if (product.category === 'mens-bottoms') return 'mens-bottoms';
  return product.department === 'men' ? 'mens-tops' : 'womens-tops';
};

const seed = async (): Promise<void> => {
  await connectDatabase();

  console.info('[seed] clearing existing data');
  await Promise.all([
    CategoryModel.deleteMany({}),
    ProductModel.deleteMany({}),
    CouponModel.deleteMany({}),
    CustomerModel.deleteMany({}),
    ReviewModel.deleteMany({}),
    CartModel.deleteMany({}),
    OrderModel.deleteMany({}),
    TaxonomyTermModel.deleteMany({}),
    SizeChartModel.deleteMany({}),
    MediaModel.deleteMany({}),
    StaffModel.deleteMany({}),
    SettingsModel.deleteMany({}),
    PageModel.deleteMany({}),
    PostModel.deleteMany({}),
    ResetTokenModel.deleteMany({}),
    EmailModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ]);

  // Indexes are rebuilt after the wipe. Without this, a changed index definition
  // keeps the old one alive and a unique constraint added since the last seed
  // silently does nothing.
  await Promise.all(
    [
      CategoryModel,
      ProductModel,
      CouponModel,
      CustomerModel,
      ReviewModel,
      OrderModel,
      TaxonomyTermModel,
      MediaModel,
      StaffModel,
    ].map(async (candidate) => candidate.syncIndexes()),
  );

  /* ------------------------------ vocabulary ----------------------------- */

  console.info('[seed] vocabulary');
  const termIds = new Map<string, string>();

  for (const [group, terms] of Object.entries(SEED_VOCABULARY)) {
    await TaxonomyTermModel.insertMany(
      terms.map((term, position) => {
        const id = newId('tax');
        termIds.set(`${group}:${term.code}`, id);
        return {
          _id: id,
          group: group as TaxonomyGroup,
          code: term.code,
          label: term.label,
          swatch: term.swatch ?? null,
          position,
          isActive: true,
          isFilterable: true,
        };
      }),
    );
  }

  /* ------------------------------ size charts ---------------------------- */

  console.info('[seed] size charts');
  const chartIds = new Map<string, string>();

  for (const chart of SEED_SIZE_CHARTS) {
    const id = newId('szc');
    chartIds.set(chart.key, id);

    await SizeChartModel.create({
      _id: id,
      name: chart.name,
      unit: chart.unit,
      note: chart.note,
      columns: chart.columns.map((column) => ({ code: column.code, label: column.label })),
      rows: chart.rows.map((row) => ({ size: row.size, values: row.values })),
    });
  }

  /* ------------------------------- categories ---------------------------- */

  console.info('[seed] categories');
  const categoryIds = new Map<string, string>();
  const categoryPaths = new Map<string, string[]>();

  // Parents first, so a child can always resolve its parent's id and path.
  const ordered = [
    ...SEED_CATEGORIES.filter((category) => !category.parent),
    ...SEED_CATEGORIES.filter((category) => category.parent),
  ];

  for (const [position, category] of ordered.entries()) {
    const id = newId('cat');
    const parentId = category.parent ? categoryIds.get(category.parent) ?? null : null;
    const parentPath = category.parent ? categoryPaths.get(category.parent) ?? [] : [];
    const path = parentId ? [...parentPath, parentId] : [];

    categoryIds.set(category.slug, id);
    categoryPaths.set(category.slug, path);

    await CategoryModel.create({
      _id: id,
      slug: category.slug,
      name: category.name,
      description: category.description ?? null,
      department: category.department ?? null,
      parentId,
      path,
      position,
      imageUrl: null,
      isVisible: true,
    });
  }

  /* --------------------------------- media ------------------------------- */

  console.info('[seed] media library');
  const brandLabels = new Map(SEED_VOCABULARY.brand.map((term) => [term.code, term.label]));
  const colourTerms = new Map(SEED_VOCABULARY.colour.map((term) => [term.code, term]));

  /**
   * The stock photography is registered as MEDIA, not written as bare URLs.
   *
   * That is what makes the demo replaceable: every seeded image appears in the
   * admin's media library with a caption, and swapping one for a real photograph
   * is an upload plus a click, not a code change.
   */
  const mediaByPhoto = new Map<string, { id: string; url: string; alt: string }>();

  for (const product of SEED_PRODUCTS) {
    for (const colourway of product.colourways) {
      const colourLabel = colourTerms.get(colourway.code)?.label ?? colourway.code;

      for (const photo of colourway.photos) {
        if (mediaByPhoto.has(photo)) continue;

        const id = newId('med');
        const url = imageUrl(photo);
        // Written from the product and colour it belongs to, so a screen reader
        // hears "Ribbed Knit Midi Dress in Berry" rather than "image".
        const alt = `${product.name} in ${colourLabel}`;

        await MediaModel.create({
          _id: id,
          filename: `${product.slug}-${colourway.code}.jpg`,
          mimeType: 'image/jpeg',
          size: 0,
          key: url,
          provider: 'external',
          alt,
          tags: [product.department, colourway.code, product.category],
        });

        mediaByPhoto.set(photo, { id, url, alt });
      }
    }
  }

  /* -------------------------------- products ----------------------------- */

  console.info('[seed] products');
  const productDocs = SEED_PRODUCTS.map((product) => {
    const categoryId = categoryIds.get(product.category);
    if (!categoryId) {
      throw new Error(`Product '${product.slug}' names unknown category '${product.category}'`);
    }

    const brandCode = slugify(product.brand).replace('-and-', '-').replace('&', '');
    const resolvedBrand =
      [...brandLabels.entries()].find(([, label]) => label === product.brand)?.[0] ?? brandCode;

    const variants = product.colourways.flatMap((colourway) =>
      product.sizes.map((size) => ({
        id: newId('var'),
        sku: [
          resolvedBrand.slice(0, 3).toUpperCase(),
          slugify(product.slug)
            .split('-')
            .map((word) => word.charAt(0))
            .join('')
            .toUpperCase()
            .slice(0, 5),
          colourway.code.slice(0, 3).toUpperCase(),
          size.toUpperCase(),
        ].join('-'),
        size,
        colour: colourway.code,
        price: rupees(priceForSize(product.price, size)),
        compareAtPrice: product.compareAt ? rupees(priceForSize(product.compareAt, size)) : null,
        stockQuantity: stockFor(product, size, colourway.code),
        isEnabled: true,
      })),
    );

    return {
      _id: newId('prd'),
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      brandCode: resolvedBrand,
      status: 'active',
      description: product.description,
      highlights: product.highlights,
      careInstructions: product.careInstructions,
      department: product.department,
      fabric: product.fabric,
      fit: product.fit,
      sleeveLength: product.sleeveLength ?? null,
      occasion: product.occasion,
      pattern: product.pattern ?? null,
      neckline: product.neckline ?? null,
      primaryCategoryId: categoryId,
      categoryIds: [categoryId],
      sizeChartId: chartIds.get(chartKeyFor(product)) ?? null,
      colourways: product.colourways.map((colourway) => {
        const term = colourTerms.get(colourway.code);
        return {
          code: colourway.code,
          label: term?.label ?? colourway.code,
          swatch: term?.swatch ?? '#cbd5e1',
          images: colourway.photos.flatMap((photo) => {
            const asset = mediaByPhoto.get(photo);
            return asset ? [{ mediaId: asset.id, url: asset.url, alt: asset.alt }] : [];
          }),
        };
      }),
      variants: variants.sort(
        (left, right) =>
          left.colour.localeCompare(right.colour) || sizeRank(left.size) - sizeRank(right.size),
      ),
      ratingAverage: null,
      reviewCount: 0,
      // Staggered so "newest" has a meaningful order and the NEW badge appears
      // on a realistic handful rather than on everything at once.
      publishedAt: new Date(
        Date.now() - Math.round(seededRandom(`${product.slug}:age`) * 90) * 86_400_000,
      ),
    };
  });

  await ProductModel.insertMany(productDocs);

  /* -------------------------------- coupons ------------------------------ */

  console.info('[seed] coupons');
  const SEED_COUPONS = [
    {
      code: 'WELCOME10',
      description: '10% off your first order',
      type: 'percentage' as const,
      percentage: 10,
      maxDiscount: rupees(500),
      minSpend: rupees(1499),
    },
    {
      code: 'STYLE500',
      description: 'Flat ₹500 off orders over ₹2,999',
      type: 'fixed' as const,
      amountOff: rupees(500),
      minSpend: rupees(2999),
    },
    {
      code: 'BIGDAY25',
      description: '25% off, up to ₹1,500',
      type: 'percentage' as const,
      percentage: 25,
      maxDiscount: rupees(1500),
      minSpend: rupees(3999),
    },
  ];

  await CouponModel.insertMany(
    SEED_COUPONS.map((coupon) => ({
      _id: newId('cpn'),
      ...coupon,
      isActive: true,
      endsAt: new Date(Date.now() + 90 * 86_400_000),
      usageLimit: null,
      usageCount: 0,
    })),
  );

  /* ------------------------------- reviewers ----------------------------- */

  console.info('[seed] reviewers and reviews');

  /**
   * Reviews are written by real customer documents, then the product's rating is
   * recalculated FROM them.
   *
   * This is the only way the "4.2 (178)" on a listing card and the review list on
   * the product page can be guaranteed to agree. Storing an invented average
   * alongside an empty review list is the classic seed bug: every page looks
   * right in isolation and contradicts the next one.
   */
  const reviewerPassword = await bcrypt.hash('reviewer-demo-2026', 12);
  const reviewers = await Promise.all(
    REVIEW_AUTHORS.map(async (author) => {
      const id = newId('cus');
      await CustomerModel.create({
        _id: id,
        email: `${author.firstName.toLowerCase()}.${author.lastName.toLowerCase()}@example.com`,
        passwordHash: reviewerPassword,
        firstName: author.firstName,
        lastName: author.lastName,
        addresses: [],
        wishlist: [],
      });
      return { id, author };
    }),
  );

  let reviewCount = 0;

  for (const product of productDocs) {
    const wanted = 4 + Math.floor(seededRandom(`${product.slug}:count`) * 6);
    const offset = Math.floor(seededRandom(`${product.slug}:offset`) * reviewers.length);
    const ratings: number[] = [];
    const sizes = [...new Set(product.variants.map((variant) => variant.size))];

    for (let step = 0; step < wanted; step += 1) {
      const reviewer = reviewers[(offset + step) % reviewers.length]!;
      // Stride 5 is coprime with the 12 templates, so eight reviews on one
      // product are eight DIFFERENT reviews.
      const template = REVIEW_TEMPLATES[(offset + step * 5) % REVIEW_TEMPLATES.length]!;

      await ReviewModel.create({
        _id: newId('rev'),
        productId: product._id,
        customerId: reviewer.id,
        authorName: `${reviewer.author.firstName} ${reviewer.author.lastName.charAt(0)}.`,
        rating: template.rating,
        title: template.title,
        body: template.body,
        fitFeedback: template.fitFeedback,
        sizePurchased: sizes[step % sizes.length] ?? null,
        isVerifiedPurchase: step % 4 !== 3,
        createdAt: new Date(Date.now() - (step + 1) * 6 * 86_400_000),
      });

      ratings.push(template.rating);
      reviewCount += 1;
    }

    const average =
      Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10;

    await ProductModel.updateOne(
      { _id: product._id },
      { $set: { ratingAverage: average, reviewCount: ratings.length } },
    );
  }

  /* -------------------------------- settings ----------------------------- */

  console.info('[seed] content pages');
  await PageModel.insertMany(
    SEED_PAGES.map((page) => ({
      _id: newId('pag'),
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      footerGroup: page.footerGroup,
      position: page.position,
      isPublished: true,
      blocks: page.blocks.map((block) => ({
        type: block.type,
        heading: 'heading' in block ? block.heading : '',
        body: 'body' in block ? block.body : '',
        items: 'items' in block ? block.items.map((item) => ({ ...item })) : [],
      })),
    })),
  );

  console.info('[seed] journal');
  await PostModel.insertMany(
    SEED_POSTS.map((post, index) => ({
      _id: newId('pst'),
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverUrl: imageUrl(post.cover, 1400),
      coverAlt: post.coverAlt,
      author: post.author,
      category: post.category,
      readMinutes: post.readMinutes,
      body: post.body,
      productSlugs: [...post.productSlugs],
      isPublished: true,
      // Spaced a fortnight apart so "newest first" has a visible order.
      publishedAt: new Date(Date.now() - index * 14 * 86_400_000),
    })),
  );

  console.info('[seed] store settings');
  await SettingsModel.create({
    _id: SETTINGS_ID,
    storeName: 'Threadline',
    tagline: 'Considered clothing',
    promoBar: 'Free delivery over ₹1,499 · Easy 15-day returns · Use WELCOME10',
    supportEmail: 'help@threadline.shop',
    supportPhone: '1800 000 000',
    currency: 'INR',
    locale: 'en-IN',
    shipping: {
      freeAbove: rupees(1499),
      standard: rupees(99),
      codSurcharge: rupees(49),
      deliveryDays: 5,
    },
    taxBands: [
      { rate: 5, minUnitAmount: 0, maxUnitAmount: 100_000, label: 'GST 5% (under ₹1,000)' },
      { rate: 12, minUnitAmount: 100_000, maxUnitAmount: null, label: 'GST 12% (₹1,000+)' },
    ],
    branding: {
      primary: '#12100e',
      primaryContrast: '#ffffff',
      accent: '#8f3d2f',
      accentInk: '#ffffff',
      accentSoft: '#f6e9e4',
      surface: '#ffffff',
      surfaceMuted: '#faf8f5',
      surfaceSunken: '#f2eee8',
      text: '#12100e',
      textMuted: '#6f6862',
      border: '#e6e0d8',
      success: '#2f6b45',
      warning: '#8a5a12',
      danger: '#a3231f',
      fontBody: "'Inter', system-ui, sans-serif",
      fontDisplay: "'Fraunces', Georgia, serif",
      radius: '8px',
      logoMediaId: null,
      heroMediaId: null,
      heroEyebrow: 'Autumn / Winter',
      heroTitle: 'Clothes that earn their place.',
      heroCopy:
        'Natural fibres, honest cuts and a size guide you can actually trust. ' +
        'Nothing here is designed to be replaced next season.',
    },
    identity: {
      legalName: 'Threadline Retail Private Limited',
      gstin: '27AABCT1332L1ZW',
      addressLine: 'Unit 4, Sunmill Compound, Lower Parel, Mumbai 400013',
    },
    payment: {
      upiId: 'threadline@okhdfcbank',
      upiName: 'Threadline Retail',
      bankName: 'HDFC Bank',
      accountName: 'Threadline Retail Private Limited',
      accountNumber: '50200012345678',
      ifsc: 'HDFC0001234',
    },
    promises: [
      { title: 'Free delivery over ₹1,499', copy: 'Dispatched within 24 hours.' },
      { title: '15-day returns', copy: 'Unworn, tags on, no questions.' },
      { title: 'Natural fibres', copy: 'Linen, cotton, merino and silk.' },
      { title: 'Fit-checked reviews', copy: 'Real sizing notes from real orders.' },
    ],
    features: { wishlist: true, reviews: true, guestCheckout: true, codEnabled: true },
  });

  /* --------------------------------- staff ------------------------------- */

  console.info('[seed] staff accounts');
  const ADMIN_PASSWORD = 'threadline-admin-2026';
  const staffPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const STAFF = [
    { email: 'admin@threadline.shop', name: 'Aditi Mishra', role: 'owner' },
    { email: 'merch@threadline.shop', name: 'Riya Merchandiser', role: 'merchandiser' },
    { email: 'ops@threadline.shop', name: 'Karan Operations', role: 'operations' },
    { email: 'analyst@threadline.shop', name: 'Neha Analyst', role: 'analyst' },
  ];

  await StaffModel.insertMany(
    STAFF.map((member) => ({
      _id: newId('stf'),
      email: member.email,
      passwordHash: staffPassword,
      name: member.name,
      role: member.role,
      permissions: ROLE_PRESETS[member.role] ?? [],
      isActive: true,
    })),
  );

  /* ------------------------------ demo shopper --------------------------- */

  /**
   * A few notifications and emails so the admin is not empty on a fresh seed.
   *
   * Learned the hard way: reseeding after a demo wipes the very rows that prove
   * the feature works, and an empty Notifications page looks identical to a
   * broken one.
   */
  console.info('[seed] demo notifications and emails');
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

  await NotificationModel.insertMany([
    {
      _id: newId('ntf'),
      type: 'order.placed',
      title: 'New order TL-SEED01',
      body: '2 items · UPI · Mumbai',
      href: '/orders',
      severity: 'info',
      permission: 'order.view',
      readBy: [],
      createdAt: hoursAgo(2),
    },
    {
      _id: newId('ntf'),
      type: 'stock.low',
      title: 'Heavyweight Cotton Tee (M) — 2 left',
      body: 'Restock or disable the size so it stops being offered.',
      href: '/products',
      severity: 'warning',
      permission: 'inventory.manage',
      readBy: [],
      createdAt: hoursAgo(6),
    },
    {
      _id: newId('ntf'),
      type: 'review.posted',
      title: '2★ review on Printed Tea Dress',
      body: 'by Nisha V.',
      href: '/reviews',
      severity: 'warning',
      permission: 'review.moderate',
      readBy: [],
      createdAt: hoursAgo(20),
    },
  ]);

  await EmailModel.insertMany([
    {
      _id: newId('eml'),
      to: 'demo@threadline.shop',
      subject: 'Threadline — order TL-SEED01 confirmed',
      template: 'order-confirmed',
      body:
        'Hi Aditi,\n\nThanks — we have your order TL-SEED01.\nPayment received.\n\n' +
        '  2 × Heavyweight Cotton Tee — M / White\n      ₹2,398\n\n' +
        'Total                 ₹2,398\n\n— Threadline',
      data: { reference: 'TL-SEED01' },
      status: 'recorded',
      provider: 'outbox',
      sentAt: hoursAgo(2),
      createdAt: hoursAgo(2),
    },
    {
      _id: newId('eml'),
      to: 'demo@threadline.shop',
      subject: 'Threadline — Order TL-SEED01 is on its way',
      template: 'order-shipped',
      body:
        'Hi Aditi,\n\nYour order has shipped. Tracking number: BD10029384IN.\n\n— Threadline',
      data: { reference: 'TL-SEED01', status: 'shipped' },
      status: 'recorded',
      provider: 'outbox',
      sentAt: hoursAgo(1),
      createdAt: hoursAgo(1),
    },
  ]);

  console.info('[seed] demo customer');
  const CUSTOMER_PASSWORD = 'threadline-demo-2026';
  await CustomerModel.create({
    _id: newId('cus'),
    email: 'demo@threadline.shop',
    passwordHash: await bcrypt.hash(CUSTOMER_PASSWORD, 12),
    firstName: 'Aditi',
    lastName: 'Sharma',
    phone: '9876543210',
    addresses: [
      {
        id: newId('adr'),
        label: 'Home',
        fullName: 'Aditi Sharma',
        phone: '9876543210',
        line1: '14 Turner Road, Bandra West',
        line2: 'Near Lucky Hotel',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050',
        country: 'IN',
        isDefault: true,
      },
    ],
    wishlist: [],
    acceptsMarketing: true,
    paymentMethods: [
      {
        id: newId('pay'),
        type: 'card',
        brand: 'visa',
        last4: '4242',
        upiId: null,
        expiryMonth: 8,
        expiryYear: 2029,
        label: 'Personal card',
        isDefault: true,
      },
      {
        id: newId('pay'),
        type: 'upi',
        brand: 'upi',
        last4: null,
        upiId: 'aditi@okhdfcbank',
        expiryMonth: null,
        expiryYear: null,
        label: 'UPI',
        isDefault: false,
      },
    ],
  });

  const vocabularySize = Object.values(SEED_VOCABULARY).reduce(
    (total, terms) => total + terms.length,
    0,
  );

  console.info(`
[seed] done

  ${productDocs.length} products · ${productDocs.reduce((n, p) => n + p.variants.length, 0)} variants
  ${categoryIds.size} categories · ${vocabularySize} vocabulary terms · ${SEED_SIZE_CHARTS.length} size charts
  ${mediaByPhoto.size} images · ${SEED_PAGES.length} content pages · ${SEED_POSTS.length} journal entries
  ${reviewCount} reviews · ${SEED_COUPONS.length} coupons (${SEED_COUPONS.map((c) => c.code).join(', ')})

  ADMIN   http://localhost:5174
          admin@threadline.shop / ${ADMIN_PASSWORD}      (owner — everything)
          merch@threadline.shop / ${ADMIN_PASSWORD}      (merchandiser)
          ops@threadline.shop   / ${ADMIN_PASSWORD}      (operations)
          analyst@threadline.shop / ${ADMIN_PASSWORD}    (read + CSV export)

  SHOP    http://localhost:5173
          demo@threadline.shop  / ${CUSTOMER_PASSWORD}
`);

  await disconnectDatabase();
};

seed().catch((error: unknown) => {
  console.error('[seed] failed', error);
  process.exit(1);
});
