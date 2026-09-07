# Threadline — project overview

An apparel storefront and admin on the **MERN** stack — MongoDB, Express, React,
Node — with TypeScript end to end.

A garment varies by **size × colour**. The design goal was that a merchant should
never need a developer to change what the shop sells or how it looks, so the
catalogue, taxonomy, theme, tax bands and content all live in the database.

---

## 1. Running it

```bash
npm install            # once, from this directory
cp .env.example .env   # defaults work against a local mongod
npm run seed           # builds the whole demo shop
npm run dev            # API :4000 · shop :5173 · admin :5174
```

MongoDB must be running (`brew services start mongodb-community`), or point
`MONGODB_URI` anywhere.

| Surface | URL | Sign in |
| --- | --- | --- |
| **Admin** | **http://localhost:5174** | `admin@threadline.shop` / `threadline-admin-2026` |
| Shop | http://localhost:5173 | `demo@threadline.shop` / `threadline-demo-2026` |
| API | http://localhost:4000/api/health | — |

Admin accounts, one per role, all with password `threadline-admin-2026`:

| Email | Role | Holds |
| --- | --- | --- |
| `admin@` | owner | all 14 permissions |
| `merch@` | merchandiser | catalogue, media, reviews |
| `ops@` | operations | orders, stock, customers |
| `analyst@` | analyst | read everything + `data.export` |

Coupons to try: `WELCOME10` · `STYLE500` · `BIGDAY25`
Full admin walkthrough: [ADMIN-GUIDE.md](./ADMIN-GUIDE.md)

### Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | All three apps together |
| `npm run dev:test` | The same, with the credential limit raised so the smoke suite can run |
| `npm run seed` | Wipes and rebuilds the demo shop |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run lint` | ESLint over the workspace |
| `npm run smoke` | 336 end-to-end checks against a live, freshly seeded server |
| `npm run build` | Server bundle + both client builds |

---

## 2. Layout

```
shared/    Types and pure helpers imported by ALL THREE apps
server/    Express + Mongoose API  (storefront + admin)
client/    React + Vite storefront
admin/     React + Vite admin
tools/     End-to-end smoke suite
docs/      This file, the admin guide, the bug log, the testing notes
```

| Workspace | Files | Lines |
| --- | --- | --- |
| `shared` | 10 | 796 |
| `server` | 79 | 12,752 |
| `client` | 45 | 6,085 |
| `admin` | 31 | 7,011 |

105 HTTP endpoints across 12 collections.

`shared/` is the load-bearing piece. The API's responses and both clients' props
are typed against the same file, so renaming a field server-side stops the
clients compiling instead of producing `undefined` in a browser.

---

## 3. What is dynamic

The design goal was that **a merchant should never need a developer** to change
what the shop sells or how it looks. Concretely:

| Thing | Where it lives | Changed by |
| --- | --- | --- |
| Products, variants, prices, stock | `products` | Admin |
| Colours, sizes, brands, fabrics, fits, occasions, patterns, necklines, departments | `taxonomy_terms` | Admin |
| Category tree | `categories` | Admin |
| Size charts (including which columns exist) | `size_charts` | Admin |
| Product photography and alt text | `media` + local disk | Admin |
| Promo bar, hero, palette, promises | `settings` | Admin |
| Delivery thresholds, COD fee | `settings` | Admin |
| GST rates and band boundaries | `settings` | Admin |
| Feature switches | `settings` | Admin |
| Coupons | `coupons` | Admin |
| Staff, roles and per-permission access | `staff_users` | Admin |
| The full 14-colour palette, fonts, corner radius | `settings` | Admin |
| Legal name, GSTIN, registered address | `settings` | Admin |
| UPI id and bank payout details | `settings` | Admin |
| Journal entries, their categories and linked products | `posts` | Admin |
| Footer pages, and which footer column they appear in | `pages` | Admin |

Nothing in that list is a constant in the source. The storefront fetches
`/api/storefront/bootstrap` once and renders from it.

**Verified end to end, twice:**

- Changing the free-delivery threshold from ₹1,499 to ₹999 in the admin changed
  the promo bar, the hero, *and* what the pricing engine charged for delivery —
  with no restart and no deploy.
- Writing a journal entry in a category that did not exist (`Care`) put the
  entry on `/journal` and added a `Care` filter chip beside the others. The
  category list is derived from what has been written, not declared anywhere.

---

### What a shopper can do for themselves

The account page has five tabs, all backed by real endpoints:

| Tab | Contains |
| --- | --- |
| Orders | Full history, expandable to lines, address, tracking and the itemised total |
| Profile | Name, phone, marketing opt-in. Email is read-only |
| Addresses | Add, edit, delete, set default. One is filed automatically at checkout |
| Payments | Saved cards and UPI handles |
| Security | Change password, current password required |

A saved card keeps **only** the network, the last four digits and the expiry. No
PAN, no CVV, no chargeable token — a real gateway holds those, and this shop
deliberately cannot.

---

## 4. Decisions worth knowing

**Money is an integer count of paise.** `0.1 + 0.2 !== 0.3` in IEEE-754, and on
an invoice that becomes a one-paisa mismatch, a customer complaint and a wrong
GST filing. A decimal appears exactly once, in the formatter.

**Apparel GST is banded, per unit.** Under ₹1,000 a garment is 5%, at or above it
12% — and the band applies to the *unit* price. Two ₹600 shirts are 5% each, not
12% on a ₹1,200 line. Banding the line total instead overcharges precisely the
customers who buy two of something cheap. The bands are settings, not code.

**Prices are tax-inclusive**, so tax is *extracted* (`gross − gross/1.12`), never
added. Getting that backwards overstates every invoice by the tax on the tax.

**A bag line stores no price.** A bag can sit for a week; quoting a stale price is
either a loss for the shop or a broken promise. Prices resolve from the live
variant on every read, through the same `computeTotals` checkout uses — so the
number in the bag is the number charged.

**An order line is a snapshot.** Name, size, colour and price are copied at
purchase. A line that joins back to the live product silently rewrites history the
moment someone renames or repriced something.

**Stock is reserved with the quantity guard in the query filter**, not in an `if`
above it. Two shoppers buying the last shirt both pass a read-then-check; here the
second `updateOne` matches nothing and the caller rolls back every earlier
reservation. Without a replica set there are no transactions, so the compensating
release *is* the guarantee.

**Ending an order gives its stock back — once, and only from the shelf.**
Stock is reserved when the order is written, so every path that ends one has to
return it: an admin cancelling, the sweeper expiring an unpaid order, a return
coming back in. Cancelling used to credit *nothing*, which took three shirts off
sale permanently and silently — nothing failed, the number was simply wrong.
Three callers each crediting the same units is the opposite failure and just as
quiet, so there is one release and it is guarded by `stockReleasedAt: null` **in
the update filter**, not by a check above it.

**Cancelling only restocks before dispatch.** A `packed` order's goods are in the
building; a `shipped` order's are on a van, and putting those back on sale sells
the same garment twice. They return through a return.

**A return does not restock on its own.** The goods are physically back, but a
worn or damaged garment going straight onto the shelf is worse than one sitting
in a box, so it takes the merchant saying they have looked at it.

**Facets are counted against every filter except their own.** Selecting "Black"
must not collapse the colour list to one option — the shopper could never widen
their choice without clearing it first.

**Filters match `brandCode`, never the display name.** These drifted once: the
facet emitted `"Mercer Denim"` while the query lowercased it, so every brand
filter silently returned nothing. Both sides are lowercase codes now.

**A colourway owns its photographs.** Picking "Sage" swaps the whole gallery, so
images hang off the colour, not the product. An earlier version filled short
galleries from a shared pool, which is how a swatch labelled "White" opened on a
blue shirt.

**Sizes are an ordered list, and every sort ends with `_id`.** A selector reading
`L, M, S, XL` looks broken; and without a unique tiebreaker two equally-priced
products have no defined order between pages, so one appears twice and another
never appears at all.

**Out-of-stock sizes are shown struck through, not hidden.** Hiding an XL reads as
"this shop does not make an XL" — a different and worse message.

**Ratings are denormalised onto the product but derived from real reviews.** A
48-card listing would otherwise aggregate every review in the shop to draw 48 star
ratings. They are recalculated from the full set on every write, so a card can
never disagree with the review list.

**Fit feedback needs three reviews and a real majority** before the page says
"runs small". One voice is a person who ordered the wrong size; publishing that as
a verdict would generate the returns the feature exists to prevent.

**Settings save partially, by dot path.** Mongo's `$set` replaces a nested
object wholesale, so saving one colour used to wipe the other thirteen plus the
hero copy. Flattening `{branding:{accent}}` to `{'branding.accent':…}` updates one
leaf and leaves its siblings alone. Arrays are still set whole, because removing
the third tax band has to actually remove it.

**Bulk export is its own permission.** `catalog.view` lets someone page through
products; `data.export` lets them download every one in a file. For customers the
difference matters — reading one to answer a ticket is not the same act as
exporting every email, phone and lifetime value.

**A saved card stores the last four digits and nothing else.** No PAN, no CVV, no
token that could be charged. Keeping the full number would put this database in
PCI scope, which is a promise a demo has no business making.

**A staff role is a preset over a permission list, not a hierarchy.** A
merchandiser who also needs order access gets that one permission rather than
becoming an owner. Changing someone's role re-applies that role's preset —
otherwise the label moves and the access does not.

**Admin routes are guarded, not just hidden.** Hiding a sidebar link does nothing
for a typed URL or a pasted link. Each route checks its permission and, when it
fails, names the missing one: told only "forbidden", a person has to guess.

**Saving a product never reprices existing variants.** The base price seeds new
size × colour combinations only, because overwriting would wipe the per-size
ladder the moment someone added a colour. Repricing a whole line is a separate,
explicit button.

**Blur-to-save is used in a table and nowhere else.** In a modal it loses data:
type a value, click close, and the dialog unmounts before the handler runs. The
order dialog uses an explicit Save; the variant grid keeps blur and shows a
"Saved" flag.

**Filters live in the URL.** A filtered view can be shared, bookmarked and reached
with the back button — and back-from-a-product is the most common move on a
listing page.

**Admin tokens carry an audience claim, and it is verified.** Without it a
customer's token would satisfy the admin middleware's signature check — the secret
is the same — and any shopper could call an admin endpoint with the token they
already have.

**Admin permissions are read from the database, not the token.** A token carrying
its own permissions would keep working after an owner revoked them, for the whole
seven-day lifetime of that token.

**Taxonomy terms deactivate, they do not delete.** A colour that has been sold is
referenced by order lines, and a shop that loses the name of what it shipped
cannot answer a customer question.

---

## 4a. How the shop gets paid

Checkout used to write `paymentStatus: 'paid'` for anything that was not cash on
delivery. Nothing had moved and nothing had been checked — picking UPI was
enough to be marked paid — so the shop would have packed and shipped goods it
was never paid for and reported the revenue on its own dashboard. It reads as
working right up until the first reconciliation.

There are two ways to be paid now, and neither trusts the shopper.

### By hand — the default, and what a shop without a gateway actually does

| Step | State | Who acts |
| --- | --- | --- |
| Order placed | `pending` / `awaiting_payment` | — |
| Shopper transfers and quotes the reference | `pending` / `verifying` | Shopper |
| Statement checked, money found | `confirmed` / `paid` | Staff (`payment.verify`) |
| Statement checked, nothing there | `pending` / `awaiting_payment` + a reason | Staff |
| Nobody paid within the window | `cancelled` / `failed`, stock released | The sweeper |

**An unpaid order is not confirmed.** Confirming it would put goods nobody has
paid for into the packing queue. Cash on delivery is the exception: the money
arrives at the door, so it is confirmed and shipped on trust.

**The UPI link carries the amount and the order number.** A shopper retyping
₹2,499 into their own app types ₹2,490 often enough that the shop spends its
evenings matching short payments to orders. The same string is rendered as a QR,
because half the people reaching that page are on a laptop where a `upi://` link
opens nothing.

**A claim is not a payment.** `verifying` exists because "I have sent it" and
"the money is here" are different assertions and only one of them is evidence. A
shop that trusted the first would ship to anyone willing to type twelve digits.

**Rejecting reopens the order rather than killing it.** A mistyped UTR is the
common case, and cancelling would make a shopper who genuinely paid place the
order again at a price that may have moved.

**Unpaid orders hold reserved stock, so a sweeper gives it back** after
`PAYMENT_WINDOW_HOURS` (24 by default). The order survives as `failed` rather
than being deleted — the shop needs to see what it nearly sold. Claiming clears
the deadline, so an order whose money may already be sitting unread in the
account is never swept away.

### Through Razorpay — implemented, and off

Inert without `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, and still off behind
a settings switch even with them. Both are required, because a merchant must not
be able to toggle their way into a checkout with no credentials behind it. Card
and net banking simply do not appear as options until it is on; there is no way
to take a card by hand, so offering one would be a lie.

Spoken to over its REST API — three calls and two HMACs — rather than through an
SDK, so a shop taking bank transfers carries no dependency for a gateway it does
not use.

**Three things are checked on the way back, and dropping any one is a way to be
robbed:**

1. **The signature is genuine**, compared with `timingSafeEqual` rather than
   `===`, which returns at the first differing byte and is measurable.
2. **It was issued for THIS order.** A valid signature proves Razorpay issued
   those values for *some* order of this merchant's — it says nothing about
   which. Without binding it to the gateway order id stored on the order being
   paid, a shopper can pay ₹50, replay the payment id, order id and signature
   against a ₹50,000 order, and every value verifies. The goods ship free.
3. **The amount matches.** A signature says nothing about whether the payment
   succeeded or was partial, so the gateway is asked what it actually captured
   and the answer is compared with the total the server computed.

The webhook is the authority; the browser handoff is a convenience so the
shopper sees "paid" at once rather than staring at "awaiting payment". Someone
who pays and immediately closes the tab never returns the handoff at all.

**The webhook mounts ahead of `express.json`.** Its signature covers the raw
bytes, and `express.json` marks a request as parsed — after which the route's own
`raw()` silently does nothing and hands back a re-serialised object whose digest
can never match. That ordering is load-bearing: moving it rejects every genuine
webhook as a forgery, and presents as payments that never confirm.

### One rule, one place

`lib/payments/policy.ts` decides whether money may still be taken. A cancelled or
returned order has put its stock back on sale and can never be marked paid; an
already-settled one cannot be settled twice. The manual verifier, the browser
handoff and the webhook all ask the same function, because a rule written out at
one of three call sites is a rule that will be missed at the fourth.

Settlement is idempotent and guarded **inside the query filter**, not by a
read-then-check above it — so a retried webhook and a double-tapped Verify button
confirm one payment rather than two.

**`payment.verify` is its own permission**, separate from `order.manage` for the
same reason `data.export` is separate from `customer.view`: typing a tracking
number and declaring a ₹40,000 transfer received are different acts, and the
second is the only thing in this panel that cannot be undone by editing a field
back.

**The shop's own bank details are not in the public bootstrap.** They reach a
shopper holding an unpaid order, after they have proved the order is theirs, and
nobody else.


## 5. API surface

### Storefront (public)

| | |
| --- | --- |
| `GET /api/health` | Reports the database too, not just the process |
| `GET /api/storefront/bootstrap` | Settings + vocabulary, in one request |
| `GET /api/catalog/navigation` | Category tree, counts rolled up the tree |
| `GET /api/catalog/products` | Listing: filters, facets, sort, pagination |
| `GET /api/catalog/products/:slug` | Detail, specs, size chart |
| `GET /api/catalog/products/:slug/related` | Related rail |
| `GET·POST·PATCH·DELETE /api/cart…` | Bag and coupon |
| `POST /api/auth/sign-up · sign-in`, `GET /api/auth/me` | Shopper accounts |
| `POST /api/checkout`, `GET /api/orders`, `GET /api/orders/:reference` | Orders |
| `GET /api/orders/:reference/payment` | Where to send the money, fetched again on a reload |
| `POST /api/orders/:reference/payment/claim` | "I have transferred it" — a claim, not a payment |
| `GET /api/orders/:reference/payment/status` | Polled while a gateway payment is outstanding |
| `POST /api/orders/:reference/payment/gateway/verify` | The browser's handoff after a Razorpay checkout |
| `POST /api/payments/webhook/razorpay` | The gateway, signed over the raw body. Mounted before the JSON parser |
| `GET·POST /api/products/:id/reviews` | Reviews |
| `/api/account/addresses…`, `/api/account/wishlist…` | Account |
| `PUT /api/account/profile`, `PUT /api/account/password` | Profile |
| `/api/account/payment-methods…` | Saved cards and UPI |
| `POST /api/auth/forgot-password · reset-password` | Password reset — same reply for a known and an unknown address |
| `GET /api/storefront/journal`, `GET /api/storefront/journal/:slug` | The blog, with product links resolved at read time |
| `GET /api/storefront/pages/:slug` | A footer page |

Admin-only extras beyond CRUD:

| | |
| --- | --- |
| `POST /api/admin/products/:id/apply-price` | Reprice every variant, explicitly |
| `PATCH /api/admin/products/:id/variants/:vid` | One cell of the stock grid |
| `GET /api/admin/media/:id/usage` | Which products would break if this image went |
| `GET /api/admin/export/{products,orders,customers}` | CSV, needs `data.export` |
| `PUT /api/admin/staff/:id/password` | Reset someone's password |
| `PUT /api/admin/auth/profile`, `PUT /api/admin/auth/password` | Your own account. Ignores `role`, `permissions` and `isActive` by design |
| `/api/admin/journal…`, `/api/admin/pages…` | Blog and footer pages, gated on `cms.manage` |
| `GET /api/admin/notifications`, `GET /api/admin/emails` | The staff feed and the outbox |
| `GET /api/admin/payments` | The queue of transfers waiting on a human, with per-state counts |
| `POST /api/admin/payments/:id/verify` · `/reject` | Confirm or send back. Needs `payment.verify` |

### Admin (staff token required)

`/api/admin/…` — `auth`, `dashboard`, `products`, `categories`, `taxonomy`,
`size-charts`, `media`, `orders`, `customers`, `coupons`, `reviews`, `settings`,
`staff`, `export`, `journal`, `pages`, `notifications`, `emails`. Every route is
gated on a named permission; the export routes require two.

**Caching.** Merchant-editable endpoints (`bootstrap`, `journal`, `pages`) send
`Cache-Control: no-cache` — the browser keeps its copy but revalidates against
the ETag, so an unchanged response costs a 304 with no body. They used to send
`max-age=300`, which meant an edit made in the admin did not reach the shop for
five minutes and looked exactly like a failed save.

### Errors

One envelope, with a `fields` map so a form highlights the offending input rather
than printing a sentence at the top of the page:

```json
{ "error": { "code": "bad_request", "message": "…",
             "fields": { "shippingAddress.postalCode": "Enter a 6-digit PIN code" } } }
```

---

## 6. Data model

| Collection | Holds |
| --- | --- |
| `products` | Product, embedded colourways and variants |
| `categories` | Tree with a materialised `path` |
| `taxonomy_terms` | The whole controlled vocabulary, one row per term |
| `size_charts` | Reusable measurement tables |
| `media` | Uploaded and external images |
| `carts` | Guest and customer bags (30-day TTL index) |
| `orders` | Snapshotted line items and totals, and the payment trail |
| `customers` | Shoppers, addresses, wishlist |
| `reviews` | One per customer per product (unique index) |
| `coupons` | Discount codes and their usage ledger |
| `staff_users` | Admin accounts and permissions |
| `settings` | One document, `_id: "store"` |

Seeded: 21 products · 77 vocabulary terms · 11 categories · 4 size charts ·
42 images · 131 reviews · 5 staff · 3 coupons.

---

## 7. Status

| | |
| --- | --- |
| `npm run typecheck` | **0 errors** across 4 workspaces |
| `npm run lint` | **0 errors** (warnings are intentional non-null assertions) |
| `npm run build` | Passes — server bundle, shop, admin |
| `npm run smoke` | **336 checks, 0 failures** — see [TESTING.md](./TESTING.md) |
| Bugs found and fixed | **27**, each with a regression test — see [BUGS-FIXED.md](./BUGS-FIXED.md) |
| Seed | 20 products · 195 variants · 76 vocabulary terms · 4 size charts · 42 images · 130 reviews · 5 content pages · 3 journal entries · a seeded notification feed and outbox |

### Known limits of the demo

- **No gateway account, so payments are confirmed by hand.** See §4a. Razorpay
  is implemented and dormant; it needs keys in the environment and a switch in
  Store settings before any card can be taken.
- **Product photography is licensed stock, matched by hand.** Every colourway was
  checked against the swatch it sits under. Some colourways have one photograph
  rather than three, which is the honest outcome — padding a gallery with another
  colourway's images is what produced the mismatches in the first place.
- **Uploads go to local disk** (`.uploads/`, served at `/uploads`). The storage
  module talks to `put`/`remove`/`publicUrl`, so an S3 or Cloudinary adapter drops
  in without a single caller changing.
- **Caches are per-process.** Settings (30s) and vocabulary (60s) are held in
  memory and invalidated on write, so a save is visible at once on the instance
  that handled it. Behind several instances the others converge within the TTL.
- **Email is recorded, not sent.** Every message is written to an outbox and
  listed in the admin with status `recorded`. `EmailDelivery` is the seam a real
  provider drops into. Claiming to have sent mail that was never sent would have
  been the easier demo and the wrong one.
- **Guest bags are swept after 30 days** by a TTL index rather than a cron job.
- **No unit tests.** The pure logic worth isolating — money arithmetic, tax
  banding, variant reconciliation — is covered end to end instead. Unit tests
  around `computeTotals` and `reconcileVariants` are the first thing to add.
- **Emails are not sent.** The confirmation page says one is on its way; nothing
  dispatches it. The order carries the address it would go to.
- **Dark mode borrows only the accent** from the merchant's palette. A
  merchant-chosen cream surface would make the dark theme unreadable, and asking
  for two full palettes to change one colour is a worse trade than the constraint.
