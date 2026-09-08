# Threadline

An apparel storefront on the **MERN** stack — MongoDB, Express, React, Node — with
TypeScript end to end.

A garment varies by **size × colour**, and nothing about the shop is hard-coded:
catalogue, taxonomy, categories, size charts, theme, GST bands, coupons, staff
permissions and content all live in the database and are edited from the admin.

---

## Running it

```bash
npm install            # once, from this directory
cp .env.example .env   # defaults work against a local mongod
npm run seed           # builds the whole demo shop
npm run dev            # API :4000 · shop :5173 · admin :5174
```

| Surface | URL | Sign in |
| --- | --- | --- |
| **Admin** | **http://localhost:5174** | `admin@threadline.shop` / `threadline-admin-2026` |
| Shop | http://localhost:5173 | `demo@threadline.shop` / `threadline-demo-2026` |

### Docs

| | |
| --- | --- |
| [docs/PROJECT.md](docs/PROJECT.md) | Architecture, every decision and its reason, API, data model |
| [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) | What a merchant can change, and where |
| [docs/BUGS-FIXED.md](docs/BUGS-FIXED.md) | The 27 bugs found while building, with root causes |
| [docs/TESTING.md](docs/TESTING.md) | How to run both suites — 384 API checks and 61 browser checks |

You need MongoDB running locally (`brew services start mongodb-community`) or any
`MONGODB_URI`.

**Coupons** — `WELCOME10` (10%, max ₹500, min ₹1,499) · `STYLE500` (flat ₹500 over
₹2,999) · `BIGDAY25` (25%, max ₹1,500, min ₹3,999)

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API, storefront and admin together |
| `npm run seed` | Wipes and rebuilds the demo shop |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run lint` | ESLint over the workspace |
| `npm run build` | Server bundle + both client builds |
| `npm run smoke` | 384 end-to-end checks against a live, seeded server |
| `npm run smoke:ui` | 86 checks that drive the admin in a real browser |

---

## Layout

```
shared/    Types and pure helpers imported by ALL THREE apps
server/    Express + Mongoose API  (storefront + admin)
client/    React + Vite storefront
admin/     React + Vite admin
```

`shared/` is the load-bearing piece. The API's responses and both clients' props
are typed against the same file, so renaming a field server-side stops the
clients compiling instead of producing `undefined` in a browser.

**Nothing about the shop is hard-coded.** Products, colours, sizes, brands,
fabrics, categories, size charts, photography, the promo bar, the hero, delivery
thresholds, GST bands and feature switches all live in the database and are edited
from the admin — no deployment. See [docs/PROJECT.md §3](docs/PROJECT.md).

---

## Decisions worth knowing

**Money is an integer count of paise.** `0.1 + 0.2 !== 0.3` in IEEE-754, and on an
invoice that becomes a one-paisa mismatch, a customer complaint and a wrong GST
filing. A decimal appears exactly once, in the formatter.

**Apparel GST is banded, per unit.** Under ₹1,000 a garment is 5%, at or above it
12% — and the band applies to the *unit* price. Two ₹600 shirts are 5% each, not
12% on a ₹1,200 line. Banding the line total instead overcharges precisely the
customers who buy two of something cheap. The bands live in `server/src/lib/pricing.ts`
as data.

**Prices are tax-inclusive**, as Indian retail requires, so tax is *extracted*
(`gross − gross/1.12`), never added. Getting that backwards overstates every
invoice by the tax on the tax.

**A bag line stores no price.** A bag can sit for a week; quoting a stale price is
either a loss for the shop or a broken promise. Prices resolve from the live
variant on every read, through the same `computeTotals` checkout uses — so the
number in the bag is the number charged.

**An order line is a snapshot.** Name, size, colour and price are copied at
purchase. A line that joins back to the live product silently rewrites history the
moment the merchant renames or repriced something.

**Ending an order gives its stock back, once.** Cancelling, expiring and
restocking a return all go through one guarded release, so three callers cannot
credit the same units — and cancelling a *shipped* order deliberately does not
restock, because those garments are on a van.

**Stock is reserved with the quantity guard in the query filter**, not in an `if`
above it. Two shoppers buying the last shirt both pass a read-then-check; here the
second `updateOne` matches nothing and the caller rolls back every earlier
reservation. Without a replica set there are no transactions, so the compensating
release *is* the guarantee.

**Facets are counted against every filter except their own.** Selecting "Black"
must not collapse the colour list to one option — the shopper could never widen
their choice without clearing it first. Costs one indexed query per dimension,
run in parallel.

**Sizes are an ordered array, and every sort ends with `_id`.** A selector reading
`L, M, S, XL` looks broken; and without a unique tiebreaker two equally-priced
products have no defined order between pages, so one appears twice and another
never appears at all.

**Out-of-stock sizes are shown struck through, not hidden.** Hiding an XL reads as
"this shop does not make an XL", which is a different and worse message.

**Ratings are denormalised onto the product but derived from real reviews.** A
48-card listing would otherwise aggregate every review in the shop to draw 48 star
ratings. They are recalculated from the full set on every write, so a card can
never disagree with the review list.

**Fit feedback needs three reviews and a real majority** before the page says
"runs small". One voice is a person who ordered the wrong size; publishing that as
a verdict would generate the returns the feature exists to prevent.

**A colourway owns its photographs.** Picking "Sage" must swap the whole
gallery, not tint a thumbnail — so images hang off the colour, not the product,
and the seed never guesses which photo belongs to which colour by index.

**Filters live in the URL.** A filtered view can be shared, bookmarked and reached
with the back button — and back-from-a-product is the most common move on a
listing page.

---

## API

| | |
| --- | --- |
| `GET /api/health` | Reports the database too, not just the process |
| `GET /api/catalog/navigation` | Category tree with counts rolled up the tree |
| `GET /api/catalog/products` | Listing: filters, facets, sort, pagination |
| `GET /api/catalog/products/:slug` | Product detail, specs, size guide |
| `GET /api/catalog/products/:slug/related` | Related rail |
| `GET·POST·PATCH·DELETE /api/cart…` | Bag and coupon |
| `POST /api/auth/sign-up · sign-in`, `GET /api/auth/me` | Accounts |
| `POST /api/checkout`, `GET /api/orders`, `GET /api/orders/:reference` | Orders |
| `GET·POST /api/products/:id/reviews` | Reviews |
| `/api/account/addresses…`, `/api/account/wishlist…` | Account |

Errors share one envelope, with a `fields` map so a form can highlight the
offending input rather than printing a sentence at the top of the page:

```json
{ "error": { "code": "bad_request", "message": "…",
             "fields": { "shippingAddress.postalCode": "Enter a 6-digit PIN code" } } }
```

---

## Known limits of the demo

- **No gateway account, so payments are confirmed by hand.** The shop shows its
  UPI id as a `upi://pay` link with the amount and order number filled in, plus
  a QR and bank details. The shopper transfers, types the reference back, and
  someone at the shop checks the statement before the order is confirmed. This
  is what a shop without a gateway actually does, not a stub.
- **Razorpay is wired and dormant.** Set `RAZORPAY_KEY_ID` and
  `RAZORPAY_KEY_SECRET`, then turn it on in Store settings → Features. Both are
  required, so nobody can toggle their way into a checkout with no credentials
  behind it. Card and net banking only appear once it is on.
- **Product photography is licensed stock, matched by hand.** Every colourway
  names its own photographs in `seed/catalogue.ts`, and each was checked against
  the swatch it sits under — a "White" swatch opens on a white garment. Some
  colourways have one photograph rather than three, which is the honest outcome:
  padding a gallery with another colourway's images is what produced the
  mismatches in the first place.
- **Email is recorded, not sent.** Every message is written to an outbox and
  listed in the admin with status `recorded`. `EmailDelivery` is the seam a real
  provider drops into.
- **No unit tests.** The pure logic — money arithmetic, tax banding, variant
  reconciliation — is covered end to end by the smoke suite instead.
- **Guest bags are swept after 30 days** by a TTL index rather than a cron job.
