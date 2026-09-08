# Testing

## Running the suite

```bash
npm run seed                    # terminal 1 — fresh data
npm run dev:test                #              servers, credential limit raised
npm run smoke                   # terminal 2 — run ONCE
```

**384 API checks and 61 browser checks, 0 failures.**

```bash
npm run smoke      # the API, against a live seeded server
npm run smoke:ui   # the admin, in a real browser
```

### Why `dev:test` and not `dev`

The suite exercises every credential path on purpose — sign-in, sign-up, both
password-reset endpoints, a dozen staff sessions. That is far more than the
production limit of ten attempts per fifteen minutes allows, and rightly so.

`npm run dev:test` starts the API with `CREDENTIAL_RATE_LIMIT=500` and
`GLOBAL_RATE_LIMIT=5000`. Nothing else changes. The alternative was trimming the tests to fit a production number,
which would have meant testing less than the app does.

The limit is asserted from both directions: the suite reads the draft-7
`RateLimit` header to confirm the limiter is installed and counting down on both
reset endpoints, and it reads `env.ts` to confirm the production default is
still ten.

### Run it once per restart

The suite makes roughly 350 requests. `dev:test` raises the global limit as well
as the credential one — the limiter is sized for a person browsing, and the suite
walks every path in the shop in about a minute, which is not browsing:

| Limiter | Allows | Applies to |
| --- | --- | --- |
| Global | 300 requests / minute (5000 under `dev:test`) | everything |
| Credential | 10 attempts / 15 minutes (500 under `dev:test`) | sign-in, sign-up, password reset |

Both are in-memory, so restarting the API clears them. The suite detects a 429
and says so with instructions rather than failing somewhere confusing.

Several assertions also depend on known stock levels, so reseed first.

---

## Why there is a browser suite as well

The API suite could not have caught what shipped once: every endpoint was
correct, and the admin was a blank page. A client had cast a paged envelope to
an array, and React threw on the first `.filter`. TypeScript cannot see through
`api<Thing[]>(...)` — the cast is a promise the compiler believes.

`npm run smoke:ui` drives the Chrome already on the machine. It signs in, loads
all eighteen screens, and fails on a page error, a console error or a `.main`
with nothing in it.

**Loading a route is not enough, and that gap was real.** The Categories list
rendered perfectly with the bug in it, because the broken call sat inside the
edit dialog — the screen only went blank when somebody pressed "New category".
So the suite presses the buttons: it opens every create dialog, opens a product
for editing and checks its dropdowns actually have options in them, opens the
payment dialog and measures that it is centred, changes the rows-per-page and
checks the row count follows, pages forward and checks the rows change, folds a
nav group and checks the whole group goes.

Each of those was written by breaking the thing first and confirming the check
went red. Two early versions of the fold check passed on a working fold *and*
would have passed on a broken one — counting `rect.height > 0` misses that
`overflow: hidden` clips a child without changing its rectangle. A check that
cannot fail is worse than no check, because it is believed.

## What it covers

| # | Section | Checks |
| --- | --- | --- |
| 1 | Health & bootstrap | DB connectivity, the 14-colour palette, identity, payout, all 10 vocabulary groups, size ordering |
| 2 | Catalogue reads | Navigation with rolled-up counts, listing, PDP, size chart, alt text, 404s |
| 3 | Filters | Every dimension, combinations, facet exclusion, all six sorts, pagination overlap, bad input |
| 4 | Bag | Add, set quantity, per-request cap vs cumulative clamp, unknown variant, negatives |
| 5 | Coupons | Minimum-spend message, unknown code, case-insensitivity, the cap, tax reduction |
| 6 | Accounts | Sign-in, identical message for wrong password and unknown email, guest-bag merge, duplicate sign-up |
| 7 | Profile | Update, phone validation, empty-name rejection, password change with current-password check |
| 8 | Payment methods | Brand detection, last-4 only, expired card, bad UPI, default handling |
| 9 | Addresses & wishlist | CRUD, default promotion, field-level errors, toggles |
| 10 | Checkout | Validation, stock decrement, bag clearing, guest lookup by email, COD surcharge, address auto-save + dedupe |
| 11 | Reviews | Summary agrees with the card, duplicate rejection, rating recalculation, name abbreviation |
| 12 | Admin auth | Customer tokens rejected, per-role permission enforcement |
| 23 | Every list is paged | All fourteen answer with the same envelope, honour `pageSize`, cap at 100, and consecutive pages do not overlap |
| 13 | Dashboard | The window is a parameter, days bucket in the shop timezone, the series covers quiet days too, the average divides by paid orders, and a trend with no comparison is null rather than a number |
| 22 | Stock on ending an order | Cancelling restocks and cannot restock twice; a shipped cancel does not; a return restocks only when the merchant says so |
| 21 | Paying | The whole manual lifecycle — claim, send back, re-claim, verify — plus the refusals: an analyst cannot confirm money, a cancelled order cannot be marked paid, verifying twice is a no-op, an unsigned webhook is rejected |
| 13 | Admin catalogue | Taxonomy CRUD, product create/update, **variant reconciliation**, publish, archive |
| 14 | Media, coupons, orders, settings | Usage guards, coupon lifecycle, order status reaching the shopper, **partial settings saves** |
| 15 | Exports | CSV headers, BOM, CRLF, `data.export` gating |
| 1b | Password reset — enumeration safety | Identical 202 for a real and an unknown address, identical error for expired/used/never-existed tokens. Runs first, before the credential budget is spent |
| 16 | Staff lifecycle | Create, role presets, live permission changes, password reset, deactivation |
| 17 | Reset outbox and rate limiting | The reset token is in neither the outbox metadata nor the body; both reset endpoints share one budget; the production default is still ten |
| 18 | Journal | Publish/draft visibility, derived slugs, category filter, resolved product links, `cms.manage` gating, and the **save/list round-trip** that bug #24 was about |
| 19 | Editable content revalidates | No `max-age` on merchant-editable endpoints, an ETag on each, and a conditional request answered 304 — the regression test for bug #23 |
| 20 | Admin profile | Rename, own-password change with the current-password check, and that role, permissions and active status **cannot** be changed through this endpoint |

---

## The checks worth knowing about

These exist because the behaviour is easy to get wrong and expensive when it is.

**Variant reconciliation.** Adding a colour or a size must not reset the price or
stock of anything already selling. The suite adds a size, asserts every surviving
variant kept its exact figures, removes it, asserts the variants were *disabled*
rather than deleted, re-adds it and asserts the old stock came back.

**Partial settings saves.** Saving one colour must leave the other thirteen, both
fonts and the hero copy untouched. This was a real data-loss bug (see
[BUGS-FIXED #7](./BUGS-FIXED.md)).

**Facet exclusion.** Selecting "Black" must not collapse the colour facet to one
option, or a shopper can never widen their choice without clearing it first. The
suite asserts colour stays wide while brand narrows.

**Pagination overlap.** Page 1 and page 2 must share no ids. Without a unique
tiebreaker in the sort, two equally-priced products can appear twice and another
never at all.

**Token audience.** A customer token must not satisfy the admin middleware — the
signing secret is the same, so only the audience claim separates them.

**Live permission changes.** Permissions are read from the database per request,
not from the token, so revoking one takes effect immediately rather than at the
end of a seven-day token life. The suite promotes a user and asserts their
*existing* token gains the new access.

**Order status reaching the shopper.** An admin change is only real if the person
who placed the order can see it.

---

## Browser testing

Some things only reproduce in a real browser — the `/uploads` proxy gap
([#6](./BUGS-FIXED.md)) returned 200 to `curl` throughout, and the stale bag badge
([#10](./BUGS-FIXED.md)) is pure client state.

Those flows were driven through Chrome DevTools Protocol: sign-up, browse, filter,
add to bag, coupon, checkout, confirmation, account; and on the admin side product
create/edit, order status, coupon creation and the staff lifecycle. Every step went
through the same React handlers a person would trigger.

Two traps if you do the same:

- **A synthetic `blur` event does nothing.** React listens on `focusout`. Move
  focus for real.
- **React controlled inputs ignore `el.value = x`.** Use the native setter, then
  dispatch `input`.

---

## Mobile

The storefront was driven at four phone viewports with touch emulation and a
mobile user agent: **430×932, 390×844, 360×800, 320×700**.

Each page is measured for horizontal overflow — `documentElement.scrollWidth`
against the viewport, plus any element whose box pokes past the edge and is not
inside something that scrolls on purpose. A page that scrolls sideways on a phone
feels broken and is invisible at desktop width.

| Checked | Result |
| --- | --- |
| Home, listing, product, sign-in, cart, checkout, account, search | No overflow at any of the four widths |
| Burger menu | Opens, 14 links |
| Filter sheet | Slides in, scrim covers and closes on tap, body scroll locked |

Two storefront layout bugs were found and fixed this way — see
[BUGS-FIXED #15 and #16](./BUGS-FIXED.md).

### The admin on a phone

Checked the same way, at the same four widths.

| Checked | Result |
| --- | --- |
| Login, dashboard, products, orders, media, attributes, settings, staff, coupons | No overflow at any width |
| Nav drawer | Opens on the burger, dims and locks the page behind, closes on navigation and Escape |
| Attribute tabs | Scroll sideways; every tab reachable |
| Product editor | Single column, no overflow; the variant grid scrolls inside its own container |
| Settings palette | One column, all 14 colours editable |

Three real bugs came out of this — see [BUGS-FIXED #17–19](./BUGS-FIXED.md). The
worst was the nav: as a static block it pushed the first table row **700px down an
844px screen**, so a merchant scrolled past the whole menu before seeing anything
they opened the page for.

**Assert the emulation actually applied.** A device-metrics override can be
dropped by a navigation, and a shell that fails to split `"390 844"` into two
arguments produces `NaN` and a silently desktop-width run. Both happened here;
both reported a clean pass that meant nothing. The check now compares the
emulated viewport against what was requested and complains when they differ.

---

## What is not covered

- **No unit tests.** The pure logic worth isolating — money arithmetic, tax
  banding, variant reconciliation — is exercised end to end instead. Unit tests
  around `computeTotals` and `reconcileVariants` would be the first thing to add.
- **No load testing.** The facet queries fan out to one indexed query per
  dimension; that is fine at this catalogue size and unmeasured beyond it.
- **No browser matrix.** Everything was driven through Chromium, including the
  mobile runs — real iOS Safari has its own quirks, notably around `100dvh` and
  input zoom, and has not been exercised.
- **The admin is designed desktop-first**, and now works on a phone rather than
  being built for one. Wide tables scroll inside their own container instead of
  reflowing into cards, and in the product editor the Publish / Sizes / Pricing
  column sits below the long content rather than being interleaved with it. Both
  are deliberate: reflowing a stock grid into cards loses the column comparison
  that makes it useful, and the Save button is sticky, so nothing is out of reach.
