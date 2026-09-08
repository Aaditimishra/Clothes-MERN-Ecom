/**
 * Loads every admin screen in a real browser and fails on anything a person
 * would call broken.
 *
 * The API suite could not have caught what shipped last time: the endpoints were
 * all correct, and the panel was blank because a client cast an envelope to an
 * array and React threw on the first `.filter`. TypeScript cannot see through
 * `api<Thing[]>(...)` — only actually rendering the page can.
 *
 * Drives the Chrome already on the machine rather than downloading one.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.ADMIN_URL ?? 'http://localhost:5174';
const EMAIL = 'admin@threadline.shop';
const PASSWORD = 'threadline-admin-2026';

let passed = 0;
const failures = [];

const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `   ${detail}` : ''}`);
  }
};

const section = (title) =>
  console.log(`\n\x1b[1m── ${title} ${'─'.repeat(Math.max(0, 56 - title.length))}\x1b[0m`);

/** Screens a merchant can reach from the sidebar, plus the detail routes. */
const ROUTES = [
  ['/', 'Dashboard'],
  ['/notifications', 'Notifications'],
  ['/products', 'Products'],
  ['/categories', 'Categories'],
  ['/taxonomy', 'Attributes & brands'],
  ['/size-charts', 'Size charts'],
  ['/media', 'Media'],
  ['/content', null],
  ['/orders', 'Orders'],
  ['/payments', 'Payments'],
  ['/customers', 'Customers'],
  ['/coupons', 'Coupons'],
  ['/reviews', 'Reviews'],
  ['/settings', null],
  ['/staff', 'Staff'],
  ['/emails', null],
  ['/profile', null],
  ['/products/new', null],
];

/**
 * How many nav links a person can actually see.
 *
 * Two wrong answers were tried before this one, and both PASSED on a fold that
 * worked — which would have made the check worthless.
 *
 * `rect.height > 0` counts clipped links: `overflow: hidden` hides a child
 * visually but does not change its `getBoundingClientRect()`, so a collapsed
 * group still reports full-height links sitting exactly where they were.
 * Intersecting with the nav fails for the same reason — the links are laid out
 * inside the nav's bounds either way.
 *
 * What actually decides it is the CLIPPING container: a link is visible only if
 * the `.nav-items` it lives in has height. That is the element the fold
 * animates, so it is the element to ask.
 */
const VISIBLE_LINKS = `() => {
  return [...document.querySelectorAll('.nav-link')].filter((link) => {
    const r = link.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) return false;

    const clip = link.closest('.nav-items');
    if (!clip) return true;

    const box = clip.getBoundingClientRect();
    // Collapsed container: nothing inside it is on screen.
    if (box.height < 2) return false;
    // And the link has to be INSIDE it. Without this, a fold that collapses the
    // row but forgets to clip passes — the links paint over the group below,
    // which is visibly broken and would have been reported green.
    return r.bottom <= box.bottom + 1 && r.top >= box.top - 1;
  }).length;
}`;

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  /**
   * Errors are collected per navigation, not globally.
   *
   * A single bucket makes the first broken page blame every page after it.
   */
  let errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      // Failed image fetches are the seed's Unsplash URLs, not a panel fault.
      if (/favicon|net::ERR|images\.unsplash/i.test(text)) return;
      errors.push(`console: ${text.slice(0, 200)}`);
    }
  });

  const visit = async (path) => {
    errors = [];
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30_000 });
    // React renders after the fetch settles; give the tree a beat to commit.
    await new Promise((resolve) => setTimeout(resolve, 700));
    return errors;
  };

  section('The sign-in screen');
  await visit('/');
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });

  const login = await page.evaluate(() => {
    const brand = document.querySelector('.login-brand');
    const demo = document.querySelector('.login-demo');
    return {
      hasBrandPanel: Boolean(brand) && brand.getBoundingClientRect().width > 200,
      brandTinted: brand ? getComputedStyle(brand).backgroundImage !== 'none' : false,
      // Scaffolding, folded away: four accounts and a password printed under the
      // form was the loudest thing on the screen.
      demoFolded: Boolean(demo) && !demo.open,
      submitFullWidth: (() => {
        const button = document.querySelector('.login-card button[type="submit"]');
        const card = document.querySelector('.login-card');
        if (!button || !card) return false;
        return button.getBoundingClientRect().width > card.getBoundingClientRect().width - 4;
      })(),
    };
  });
  check('there is a brand panel beside the form', login.hasBrandPanel);
  check('it is tinted from the accent', login.brandTinted);
  check('the demo accounts are folded away', login.demoFolded);
  check('the submit button fills the card', login.submitFullWidth);

  // The brand half is decoration, so it is the half that goes on a phone.
  await page.setViewport({ width: 420, height: 900 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const narrow = await page.evaluate(() => ({
    brandHidden: getComputedStyle(document.querySelector('.login-brand')).display === 'none',
    markShown: getComputedStyle(document.querySelector('.login-mark')).display !== 'none',
  }));
  check('the brand panel goes on a phone', narrow.brandHidden);
  check('and the mark takes its place', narrow.markShown);
  await page.setViewport({ width: 1440, height: 900 });
  await new Promise((resolve) => setTimeout(resolve, 300));

  section('Signing in');
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', PASSWORD);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForSelector('.sidebar', { timeout: 20_000 }),
  ]);
  check('signed in and the shell rendered', true);

  section('Every screen renders');
  for (const [path, heading] of ROUTES) {
    const errs = await visit(path);

    const state = await page.evaluate(() => {
      const main = document.querySelector('.main');
      return {
        // The router renders inside .main; an empty one IS the blank page.
        mainText: (main?.innerText ?? '').trim().length,
        h1: document.querySelector('h1')?.textContent?.trim() ?? '',
        hasSidebar: Boolean(document.querySelector('.sidebar')),
      };
    });

    const ok = errs.length === 0 && state.hasSidebar && state.mainText > 40;
    check(
      `${path.padEnd(16)} renders`,
      ok,
      ok ? '' : errs[0] ?? `main had ${state.mainText} chars of text`,
    );

    if (heading && ok) {
      check(`${path.padEnd(16)} heading is "${heading}"`, state.h1 === heading, state.h1);
    }
  }

  section('A product opens for editing');
  await visit('/products');
  const productHref = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[href*="/products/"]')].find(
      (a) => !a.getAttribute('href').endsWith('/new'),
    );
    return link?.getAttribute('href') ?? null;
  });
  check('the products list links to a product', Boolean(productHref), String(productHref));

  if (productHref) {
    const errs = await visit(productHref);
    const state = await page.evaluate(() => ({
      chars: (document.querySelector('.main')?.innerText ?? '').trim().length,
      // The editor is useless without its pickers, and those are what broke.
      selects: document.querySelectorAll('select').length,
      inputs: document.querySelectorAll('input').length,
    }));
    check('the editor renders', errs.length === 0 && state.chars > 200, errs[0] ?? `${state.chars} chars`);
    check('its dropdowns are populated', state.selects >= 3, `${state.selects} selects`);
    check('its fields are there', state.inputs >= 5, `${state.inputs} inputs`);

    const options = await page.evaluate(() => {
      const counts = [...document.querySelectorAll('select')].map((s) => s.options.length);
      return Math.max(0, ...counts);
    });
    // A picker offering one option is a picker that failed to load its list.
    check('a picker offers real choices', options > 3, `${options} options`);
  }

  section('Dialogs open, and open centred');
  await visit('/payments');

  /*
   * Do not depend on the queue having something in it.
   *
   * The default tab shows payments awaiting a human, and the API suite verifies
   * one as part of its own run — so this check passed or failed depending on
   * which suite went first, which is no kind of check at all. Any tab with rows
   * will do: what is being measured is the dialog, not the queue.
   */
  const opened = await page.evaluate(async () => {
    const openFirst = () => {
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Open',
      );
      if (!button) return false;
      button.click();
      return true;
    };

    if (openFirst()) return true;

    for (const label of ['Paid', 'Cash on delivery', 'Expired', 'Awaiting payment']) {
      const tab = [...document.querySelectorAll('.tab')].find((t) =>
        t.textContent.trim().startsWith(label),
      );
      if (!tab) continue;
      tab.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (openFirst()) return true;
    }
    return false;
  });

  if (opened) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const box = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      if (!dialog) return null;
      const r = dialog.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, vw: innerWidth, vh: innerHeight, h: r.height };
    });
    check('the payment dialog opens', Boolean(box), 'no open dialog');
    if (box) {
      // Centred within a few pixels, rather than pinned to the corner.
      const centreX = Math.abs(box.left + box.width / 2 - box.vw / 2);
      const centreY = Math.abs(box.top + box.h / 2 - box.vh / 2);
      check('it is horizontally centred', centreX < 12, `off by ${Math.round(centreX)}px`);
      check('it is vertically centred', centreY < 12, `off by ${Math.round(centreY)}px`);
      check('it is not full width', box.width < box.vw * 0.7, `${Math.round(box.width)}px of ${box.vw}px`);
    }
  } else {
    check('the payment dialog opens', false, 'no Open button — is anything awaiting verification?');
  }

  section('Create dialogs open — where the last blank page actually lived');

  /*
   * Loading a route was not enough.
   *
   * The categories LIST rendered perfectly with the bug in it, because the
   * broken call sat inside the edit dialog — so the screen only went blank when
   * somebody pressed "New category". A route-level check reported that page
   * green while it was unusable, which is exactly the false confidence that let
   * it ship. These press the button.
   */
  const CREATORS = [
    ['/categories', 'New category'],
    ['/taxonomy', 'New attribute term'],
    ['/size-charts', 'New size chart'],
    ['/coupons', 'New coupon'],
    ['/staff', 'New staff member'],
    ['/content', 'New journal entry'],
  ];

  for (const [path, label] of CREATORS) {
    const errs = await visit(path);
    if (errs.length) {
      check(`${path.padEnd(14)} ${label}`, false, errs[0]);
      continue;
    }

    const clicked = await page.evaluate(() => {
      const button = document.querySelector('.topbar .btn-primary');
      if (!button) return false;
      button.click();
      return true;
    });

    if (!clicked) {
      check(`${path.padEnd(14)} ${label}`, false, 'no primary button in the toolbar');
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 600));

    const state = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      return {
        open: Boolean(dialog),
        fields: dialog ? dialog.querySelectorAll('input, select, textarea').length : 0,
        // Still on the page, rather than React having unmounted the tree.
        alive: (document.querySelector('.main')?.innerText ?? '').length > 40,
      };
    });

    const ok = errs.length === 0 && state.open && state.fields > 0 && state.alive;
    check(
      `${path.padEnd(14)} ${label}`,
      ok,
      ok ? '' : errs[0] ?? (state.open ? `${state.fields} fields` : 'no dialog opened'),
    );

    // Escape, so the next page does not start with a modal over it.
    await page.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  section('Pagination works, and changes what is shown');
  await visit('/reviews');
  const pager = await page.evaluate(() => {
    const rows = () => document.querySelectorAll('tbody tr').length;
    const select = document.querySelector('.pager-size select');
    return { rows: rows(), hasSizer: Boolean(select), sizerValue: select?.value ?? null };
  });
  check('reviews paginate', pager.rows > 0 && pager.rows <= 25, `${pager.rows} rows`);
  check('a rows-per-page control is present', pager.hasSizer, String(pager.sizerValue));

  if (pager.hasSizer) {
    await page.select('.pager-size select', '10');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const after = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    check('choosing 10 shows ten rows', after === 10, `${after} rows`);

    const second = await page.evaluate(() => {
      const first = document.querySelector('tbody tr')?.innerText ?? '';
      const next = [...document.querySelectorAll('.pager-pages button')].find(
        (b) => b.textContent.trim() === '2',
      );
      next?.click();
      return first;
    });
    await new Promise((resolve) => setTimeout(resolve, 900));
    const nowFirst = await page.evaluate(() => document.querySelector('tbody tr')?.innerText ?? '');
    check('page 2 shows different rows', nowFirst !== second && nowFirst.length > 0);
  }

  section('Brands are findable, and addable');

  await visit('/taxonomy');
  const brands = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.tab')].find((t) =>
      t.textContent.trim().startsWith('Brands'),
    );
    if (!tab) return null;
    tab.click();
    return true;
  });
  check('there is a Brands tab', Boolean(brands));

  if (brands) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const listed = await page.evaluate(() => ({
      rows: document.querySelectorAll('tbody tr').length,
      addLabel: document.querySelector('.topbar .btn-primary')?.textContent?.trim() ?? '',
    }));
    check('the seeded brands are listed', listed.rows >= 5, `${listed.rows} rows`);
    // The button has to name what it adds, or the tab and the button disagree.
    check('the add button says "brand"', /brand/i.test(listed.addLabel), listed.addLabel);

    await page.evaluate(() => document.querySelector('.topbar .btn-primary')?.click());
    await new Promise((resolve) => setTimeout(resolve, 500));
    const dialog = await page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      return d ? { fields: d.querySelectorAll('input, select').length } : null;
    });
    check('adding a brand opens a form', Boolean(dialog) && dialog.fields > 0,
      dialog ? `${dialog.fields} fields` : 'no dialog');
    await page.keyboard.press('Escape');
  }

  section('Tables are described by data, and the columns are the merchant\'s');

  await visit('/orders');
  const table = await page.evaluate(() => ({
    headers: [...document.querySelectorAll('.data-table thead th')].map((th) =>
      th.textContent.trim(),
    ),
    rows: document.querySelectorAll('.data-table tbody tr').length,
    hasPicker: Boolean(document.querySelector('.columns button')),
  }));
  check('orders render through the data table', table.rows > 0, `${table.rows} rows`);
  check('there is a column picker', table.hasPicker);
  check('optional columns start hidden', !table.headers.includes('Payment ref'),
    table.headers.join(', '));

  if (table.hasPicker) {
    // Open the menu, then WAIT: React has to commit before the items exist.
    // Querying in the same evaluate found nothing and reported the picker empty.
    await page.evaluate(() => document.querySelector('.columns button').click());
    await new Promise((resolve) => setTimeout(resolve, 300));

    const shown = await page.evaluate(() => {
      const item = [...document.querySelectorAll('.columns-item')].find((l) =>
        l.textContent.includes('Payment ref'),
      );
      if (!item) return false;
      item.querySelector('input').click();
      return true;
    });
    check('the picker lists the optional columns', shown);

    await new Promise((resolve) => setTimeout(resolve, 400));
    const withExtra = await page.evaluate(() =>
      [...document.querySelectorAll('.data-table thead th')].map((th) => th.textContent.trim()),
    );
    check('turning one on adds the column', withExtra.includes('Payment ref'),
      withExtra.join(', '));

    // A column choice is a working preference, not a per-visit mood.
    await visit('/orders');
    const afterReload = await page.evaluate(() =>
      [...document.querySelectorAll('.data-table thead th')].map((th) => th.textContent.trim()),
    );
    check('the choice survives a reload', afterReload.includes('Payment ref'));

    await page.evaluate(() =>
      localStorage.removeItem('threadline.admin.columns.orders'),
    );
  }

  section('Every section has the same table');

  /*
   * The panel had two table designs in it for a while — styling that lived on a
   * class only half the screens used — and it read as an unfinished redesign.
   * These check the treatment is on every one of them.
   */
  const TABLE_SCREENS = ['/products', '/orders', '/payments', '/customers', '/reviews', '/coupons', '/staff', '/taxonomy'];
  for (const path of TABLE_SCREENS) {
    await visit(path);
    const look = await page.evaluate(() => {
      const head = document.querySelector('thead th');
      if (!head) return null;
      const h = getComputedStyle(head);
      // The stripe needs a second row to be visible on, and some screens are
      // legitimately short — the payments queue is one row when the shop is up
      // to date. Checking it only where it can exist keeps this about the
      // styling rather than about how much data happens to be there.
      const evenRow = document.querySelectorAll('tbody tr')[1];
      return {
        sticky: h.position === 'sticky',
        headRule: h.borderBottomWidth,
        pad: h.paddingLeft,
        striped: evenRow ? getComputedStyle(evenRow).backgroundColor !== 'rgba(0, 0, 0, 0)' : null,
      };
    });

    const styled =
      Boolean(look) &&
      look.sticky &&
      look.headRule === '2px' &&
      look.pad === '18px' &&
      look.striped !== false;

    check(
      `${path.padEnd(12)} table is styled`,
      styled,
      look
        ? `sticky ${look.sticky}, rule ${look.headRule}, pad ${look.pad}, striped ${look.striped}`
        : 'no table on the page',
    );
  }

  section("The panel wears the shop's colour");

  await visit('/settings');
  const accent = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      brand: root.getPropertyValue('--brand').trim(),
      chart: root.getPropertyValue('--chart-1').trim(),
    };
  });
  // The seed's accent, not the stylesheet's shipped blue.
  check('the brand token comes from store settings', accent.brand.toLowerCase() === '#8f3d2f',
    accent.brand);
  check('the first chart series follows it', accent.chart.toLowerCase() === '#8f3d2f', accent.chart);

  const painted = await page.evaluate(() => {
    const link = document.querySelector('.nav-link.active');
    return link ? getComputedStyle(link).color : null;
  });
  // rgb(143, 61, 47) is #8f3d2f. If the token were set but nothing read it, this
  // would still be the old blue.
  check('and something actually paints with it', painted === 'rgb(143, 61, 47)', String(painted));

  section('An operator can pick their own accent');

  await visit('/orders');
  const picked = await page.evaluate(async () => {
    document.querySelector('.profile-trigger')?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const swatches = [...document.querySelectorAll('.swatch')];
    if (swatches.length < 2) return { count: swatches.length };
    // The second preset — the first is "Store brand", which is the default.
    swatches[1].click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      count: swatches.length,
      brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
    };
  });

  check('the profile menu offers accents', picked.count >= 12, `${picked.count} swatches`);
  check('choosing one repaints the panel', picked.brand === '#4f46e5', picked.brand);

  // A preference, so it has to outlive the page.
  await visit('/orders');
  const kept = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
  );
  check('the accent survives a reload', kept === '#4f46e5', kept);

  // And "Store brand" has to hand it back, or the choice is a one-way door.
  await page.evaluate(async () => {
    document.querySelector('.profile-trigger')?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    document.querySelector('.swatch')?.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  const restored = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
  );
  check('"Store brand" restores the shop colour', restored.toLowerCase() === '#8f3d2f', restored);

  await page.evaluate(() => localStorage.removeItem('threadline.admin.accent'));

  section("The shop wears the colour the admin sets");

  /*
   * End to end, through the settings screen a merchant actually uses — not by
   * posting to the API. What is being checked is that the whole chain holds:
   * the form saves it, the bootstrap serves it, and the storefront paints it.
   */
  const SHOP = process.env.SHOP_URL ?? 'http://localhost:5173';
  const TRIAL = '#0d9488';

  await visit('/settings');
  const saved = await page.evaluate(async (colour) => {
    const field = document.querySelector('input[type="color"][aria-label="Accent"]');
    if (!field) return 'no accent field';

    // A colour input ignores `.value =` unless the change is dispatched the way
    // React listens for it.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(field, colour);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const save = [...document.querySelectorAll('button')].find((b) =>
      /save/i.test(b.textContent) && !b.disabled,
    );
    if (!save) return 'no enabled save button';
    save.click();
    return 'saved';
  }, TRIAL);
  check('the accent can be changed from Settings', saved === 'saved', saved);

  if (saved === 'saved') {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const shop = await browser.newPage();
    await shop.goto(SHOP, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const shopAccent = await shop.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    );
    await shop.close();
    check('the shop paints the new accent', shopAccent.toLowerCase() === TRIAL, shopAccent);

    // Put it back, or every later run starts from the last one's colour.
    await visit('/settings');
    await page.evaluate(async (colour) => {
      const field = document.querySelector('input[type="color"][aria-label="Accent"]');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(field, colour);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      [...document.querySelectorAll('button')]
        .find((b) => /save/i.test(b.textContent) && !b.disabled)
        ?.click();
    }, '#8f3d2f');
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  section('The sidebar folds, and remembers');

  // Invoked, not merely passed — `evaluate` given a function expression
  // hands back the function itself.
  const countLinks = () => page.evaluate(`(${VISIBLE_LINKS})()`);

  await visit('/orders');
  const groupCount = await page.evaluate(() => document.querySelectorAll('.nav-group').length);
  const sidebarWidth = await page.evaluate(
    () => document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0,
  );
  const linksOpen = await countLinks();

  check('the nav is grouped', groupCount >= 4, `${groupCount} groups`);
  check('every link is visible to start', linksOpen >= 14, `${linksOpen} links`);

  // Fold "Catalogue" — a group that does NOT hold the current page, since one
  // that does is deliberately kept open.
  const folded = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('.nav-heading')].find((b) =>
      b.textContent.trim().startsWith('Catalogue'),
    );
    if (!heading) return false;
    heading.click();
    return true;
  });
  check('the Catalogue heading is a control', folded);

  await new Promise((resolve) => setTimeout(resolve, 500));
  const linksFolded = await countLinks();
  // The whole group has to go, not the first link of it — which is what a
  // single-row grid collapse does when the links are direct children.
  check(
    'folding hides the whole group',
    linksFolded <= linksOpen - 5,
    `${linksOpen} → ${linksFolded}`,
  );

  // Reload: the fold is a working preference, not a per-page mood.
  await visit('/orders');
  const linksReloaded = await countLinks();
  check('the fold survives a reload', linksReloaded === linksFolded,
    `${linksReloaded} vs ${linksFolded}`);

  // A folded group holding the page you are on would hide where you are.
  await visit('/products');
  const activeVisible = await page.evaluate(() => {
    const active = document.querySelector('.nav-link.active');
    const nav = document.querySelector('.nav');
    if (!active || !nav) return false;
    const r = active.getBoundingClientRect();
    const b = nav.getBoundingClientRect();
    return r.height > 0 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 2;
  });
  check('the group holding the current page opens itself', activeVisible);

  // Put it back, so the next run starts from the same place.
  await page.evaluate(() => localStorage.removeItem('threadline.admin.nav.closed'));

  section('The rail collapses to icons');
  await visit('/orders');
  await page.evaluate(() => document.querySelector('.rail-toggle')?.click());
  await new Promise((resolve) => setTimeout(resolve, 500));
  const rail = await page.evaluate(() => {
    const visible = (selector) =>
      [...document.querySelectorAll(selector)].filter(
        (el) => el.getBoundingClientRect().width > 0,
      ).length;
    return {
      width: document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0,
      labels: visible('.nav-label'),
      icons: visible('.nav-icon'),
    };
  });
  check('the rail narrows the sidebar', rail.width < sidebarWidth - 100,
    `${Math.round(sidebarWidth)} → ${Math.round(rail.width)}`);
  check('labels go, icons stay', rail.labels === 0 && rail.icons >= 14,
    `${rail.labels} labels, ${rail.icons} icons`);
  // Nothing may stay folded in the rail — with no headings there is no way to
  // reopen a group, so it would be unreachable.
  const railLinks = await countLinks();
  check('the rail shows every section', railLinks >= 14, `${railLinks} links`);

  await page.evaluate(() => document.querySelector('.rail-toggle')?.click());
  await page.evaluate(() => localStorage.removeItem('threadline.admin.rail'));

  section('Dark mode paints everything');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await visit('/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const dark = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { bg: body.backgroundColor, colour: body.color };
  });
  // A dark theme that left the body white would be the tell that a token is
  // defined only inside a media query.
  const rgb = dark.bg.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  check('dark mode darkens the page', rgb[0] < 60 && rgb[1] < 60, dark.bg);

  await browser.close();

  console.log(`\n${'='.repeat(62)}`);
  console.log(`  PASSED ${passed}   FAILED ${failures.length}`);
  console.log('='.repeat(62));
  for (const failure of failures) console.log('  ✗', failure);
  process.exit(failures.length ? 1 : 0);
};

run().catch((error) => {
  console.error('\nui-smoke crashed:', error.message);
  process.exit(1);
});
