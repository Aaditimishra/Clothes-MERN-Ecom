# Admin guide

Everything a merchant can change without a developer, and where to change it.

For the engineering side: [PROJECT.md](./PROJECT.md) (architecture and decisions),
[BUGS-FIXED.md](./BUGS-FIXED.md) (what broke and why), [TESTING.md](./TESTING.md).

---

## Signing in

| | |
| --- | --- |
| **URL** | **http://localhost:5174** |
| Shop | http://localhost:5173 |
| API | http://localhost:4000 |

### Accounts

| Email | Password | Role | Can do |
| --- | --- | --- | --- |
| `admin@threadline.shop` | `threadline-admin-2026` | Owner | Everything |
| `merch@threadline.shop` | `threadline-admin-2026` | Merchandiser | Catalogue, media, reviews — **not** pricing bands, settings or staff |
| `ops@threadline.shop` | `threadline-admin-2026` | Operations | Orders, stock, customers — **not** the catalogue |
| `analyst@threadline.shop` | `threadline-admin-2026` | Analyst | Read everything + **CSV export** — cannot edit |

> Change these before this is ever reachable from the internet. `Staff → Password`
> sets a new one; the seed values exist so the demo is usable, nothing more.

**Permissions are checked one at a time, not by role name.** The sidebar hides
what an account cannot reach rather than showing buttons that fail on click — a
greyed-out link still tells someone the feature exists and invites a support
ticket.

---

## What is editable, and where

| I want to… | Go to | Reaches the shop |
| --- | --- | --- |
| Add a product, set its photos, sizes, colours | Products → New product | On save, if status is Active |
| Change a price or stock for one size | Products → open one → *Stock & price by size* | Immediately |
| Take a product off sale | Products → Status → Draft | Immediately |
| Add a colour, fabric, fit, size, brand | Attributes | Next page load |
| Rename a colour ("Sage" → "Eucalyptus") | Attributes → Edit | Next page load |
| Add or edit a size chart | Size charts | Immediately, on every product using it |
| Replace a product photo | Media, or the product editor | On save |
| Write alt text for a photo | Media → click an image | Immediately, everywhere it is used |
| Change the promo bar / hero / colours | Store settings | Immediately |
| Change the free-delivery threshold or COD fee | Store settings → Delivery | Immediately |
| Change GST rates or bands | Store settings → GST bands | Immediately |
| Turn wishlist / reviews / COD off | Store settings → Features | Immediately |
| Create a discount code | Coupons | Immediately |
| Update an order's status or add tracking | Orders → open one | Immediately |
| Remove an abusive review | Reviews → Remove | Immediately, and the star rating is recalculated |
| Add a colleague | Staff → Add staff | Immediately |
| Change any brand colour, font or corner radius | Store settings → Brand palette | Immediately |
| Set the legal name / GSTIN | Store settings → Business identity | Immediately |
| Set the UPI id or bank account | Store settings → Payout details | Immediately |
| Write or edit a journal entry | Journal & pages → Journal | Immediately |
| Take a journal entry offline | Journal & pages → Edit → Status → Draft | Immediately |
| Change a footer page (delivery, returns, sizing) | Journal & pages → Pages | Immediately |
| Change your own name or password | Your name, bottom left → Your profile | Immediately |
| Download the catalogue, orders or customers | Export CSV on each list page | — |

**Nothing in that table needs a deployment, and nothing waits.**

Settings and the vocabulary are cached in the API for 30 and 60 seconds, but
saving invalidates that cache rather than waiting it out, and the storefront's
content endpoints revalidate on every request instead of holding a copy. An
earlier version cached them for five minutes in the browser; a merchant who
saved an edit and reloaded saw the old page and had no way to tell the save from
a failure. That is [bug #23](BUGS-FIXED.md).

---

## Products

### Creating one

1. **Products → New product.** Name, brand and department are the minimum.
2. **Colourways.** Add a colour, then add images to it. Each colourway has its
   own gallery — picking "Sage" in the shop swaps every photograph, which is why
   images hang off the colour and not off the product.
3. **Sizes.** Toggle the sizes this garment comes in. The size × colour matrix is
   generated for you: 3 colours × 5 sizes is 15 variants.
4. **Price.** One base price; the editor writes it across the whole matrix. Per-
   size prices are edited afterwards in the grid.
5. **Status → Active** to put it live.

### Editing an existing one

**Adding a colour or size never resets anything.** A surviving size × colour
combination keeps its own price and stock — reconciliation matches by axis, not
by position. Removing a size **disables** its variants rather than deleting them,
so past orders stay readable and re-adding the size restores what it had.

### Prices

Two different things, deliberately separate:

- **The Price field in the sidebar** seeds *new* size × colour combinations only.
  Existing variants keep their own price, so adding a colour never wipes the
  per-size ladder or a manual override.
- **"Apply ₹X to all N variants"** overwrites every variant, including disabled
  ones. Use it to move a whole line.

Saving must not quietly reprice things you did not touch, and repricing a line
must not take thirty edits. One button each.

### Stock

The grid at the bottom of the editor saves per cell when you leave it, and shows
a **✓ Saved** flag next to the heading each time. It is the fastest way to do a
stock take; `Sellable` off hides one size without touching its stock number.

---

## Attributes — the shop's vocabulary

Colours, sizes, brands, fabrics, fits, occasions, sleeve lengths, patterns,
necklines and departments all live here. They are what products are tagged with
**and** what shoppers filter by, which is why they are one list rather than free
text on each product: three products spelling it "Navy", "navy blue" and "Nvy"
produce three filter options, each matching a third of the stock.

- **Label** is what shoppers read. Safe to rename at any time.
- **Code** is what products store. **Not editable** — changing it would orphan
  every product using the old value, silently, because a filter matching nothing
  looks like an empty category rather than an error.
- **Deactivate, not delete.** A colour that has been sold cannot be removed —
  order lines reference it. Deactivating hides it from the filter panel and the
  product editor while leaving history intact. Reactivate any time.
- **Filterable** off keeps a value usable on products but stops offering it as a
  shopper-facing filter.

Sizes are ordered by position, never alphabetically — a size selector reading
`L, M, S, XL` looks broken to every shopper.

---

## Media

- **Drop files anywhere on the Media page** or use the picker inside the product
  editor.
- Every upload is re-encoded to **WebP** and capped at **1600px** on the long
  edge. A 6 MB phone photo becomes roughly 200 KB with no visible loss.
- **Alt text is a real field, not an afterthought.** It is the only thing a
  screen-reader user gets from a photograph, and the only thing a search engine
  reads. Editing it here updates every product using that image.
- **Deleting an image in use is refused**, and the dialog names the products that
  would break. "Delete anyway" removes it from those products too.

The demo's stock photography is registered as media like anything else, so
swapping a placeholder for a real shot is an upload plus a click.

---

## Size charts

One chart serves many garments — every women's dress shares one, and correcting a
measurement once updates all of them. A chart embedded per product would drift the
moment someone fixed a single number.

**Columns are data.** A dress needs bust / waist / hip / length; a trouser needs
waist / hip / inseam / thigh. Four fixed columns would force every trouser to
report a chest measurement.

Assign a chart in the product editor's sidebar. Products with no chart simply
show no "Size guide" link.

---

## Store settings

| Section | Controls |
| --- | --- |
| Storefront | Store name, tagline, promo bar, support contacts |
| Home page hero | Eyebrow, headline, body copy, hero image, logo, accent colours |
| Delivery | Free-delivery threshold, standard fee, COD fee, delivery days |
| GST bands | Rate and price band boundaries |
| Home page promises | The four points under the hero |
| Features | Wishlist, reviews, guest checkout, cash on delivery |

An empty promo bar hides the strip entirely rather than rendering an empty band.
Turning COD off removes it from checkout — the server would otherwise accept it
and charge the fee.

### Brand palette

Fourteen colours, each named for what a merchant sees rather than for the token
it drives. Everything the shop paints resolves to one of them, so re-skinning is
a settings change and not a stylesheet edit.

A **live preview** sits under the swatches, painting a real button, a real sale
badge and real muted text. A row of swatches shows the colours; only a rendered
button shows whether the text on it is legible.

These describe the **light** theme. Dark mode keeps its own neutrals and borrows
only the accent — a merchant-chosen cream surface would make the dark theme
unreadable, and requiring two full palettes in order to change one colour is a
worse trade than the constraint.

Fonts take a CSS font stack, so `'Inter', system-ui, sans-serif` works and so
does any family the browser can already reach.

**Partial saves are safe.** Changing only the accent leaves every other colour,
the fonts and the hero copy untouched — an earlier version replaced the whole
block and wiped them, which is now covered by a regression test.

### Payout details

The UPI id and bank account belong to the merchant and live here. **Gateway API
keys do not** — those are environment secrets, because a database row an admin
session can read is the wrong place for a credential that can move money.

GSTIN and IFSC are format-checked: a wrong GSTIN on an invoice is a compliance
problem rather than a typo.

**Fill these in before turning transfers on.** They are what a shopper is shown
when they have to pay you, and the shop cannot offer a transfer without at least
a UPI id or an account number and IFSC. "What the shopper is told" is your own
copy, printed beside the details — asking for the order number in the payment
note is what makes a bank statement matchable to an order.

These details are **not** in the shop's public configuration. They reach a
shopper holding an unpaid order, once they have proved the order is theirs, and
nobody else.

### Which ways to pay you offer

Three switches in **Features**, and the storefront shows exactly what they allow:

| Switch | What it offers |
| --- | --- |
| Cash on delivery | The courier collects. A handling fee applies |
| UPI and bank transfer | The shopper transfers and you confirm each one |
| Payment gateway (Razorpay) | Card, UPI and net banking, confirmed automatically |

**The gateway switch is one of two conditions.** It also needs its API keys set
on the server. Until they are, ticking the box changes nothing and the shop keeps
taking transfers by hand — deliberately, so nobody can produce a checkout with no
credentials behind it.

Card and net banking do not appear at all without the gateway. There is no way to
take a card by hand, so offering the option would be a lie the shopper only
discovers after filling in the whole form.

### About the GST bands

Apparel GST in India is **banded, per unit**: a garment under ₹1,000 is 5%, at or
above it 12% — and the band applies to the *unit* price. **Two ₹600 shirts are 5%
each, not 12% on a ₹1,200 line.** Banding the line total instead overcharges
exactly the customers who buy two of something cheap.

Prices are tax-**inclusive**, as Indian retail requires, so tax is extracted from
the price rather than added to it. Changing a rate here affects future orders
only; past orders keep the totals they were charged.

---

## Exports

Every list page — Products, Orders, Customers — has an **Export CSV** button.

- **Products** exports one row per *variant*, because a stock take or a price
  review happens at the size × colour level.
- **Orders** exports one row per *line*, with the order total repeated on each so
  a pivot table has it.
- **Customers** includes order count and lifetime value.

The files open cleanly in Excel: quoted cells, CRLF line endings and a UTF-8 BOM
so `₹` does not arrive as `â‚¹`. Cells beginning `=`, `+`, `-` or `@` are prefixed
with an apostrophe, because a spreadsheet executes those as formulas and a
customer's name field is somewhere an attacker can put one.

**Export is its own permission (`data.export`), separate from viewing.** Reading
customers one at a time to answer a ticket and downloading every customer's email,
phone and lifetime value are different acts with different risk — so support staff
get the first and not the second. Grant it per person in Staff.

## Payments

The queue of transfers waiting on **you** to look at a bank statement. Separate
from Orders because it is a different job at a different time: Orders is "what do
I pack today", this is "did the money arrive".

**To check** is the tab that matters — every shopper there has said they paid and
is waiting on you. The others are for reconciling.

Open one and you see the amount, the reference the shopper quoted, when they
quoted it, and how many times they have tried. Then:

- **The money is there** — marks it paid and confirms the order, so it joins the
  packing queue. Your name is recorded against it.
- **Not received** — sends the claim back with a reason the shopper reads on
  their order page, and reopens the order so they can correct the reference. It
  does not cancel the order: a mistyped UTR is the common case, and cancelling
  would make someone who genuinely paid order again at a price that may have
  moved.

**Check the statement before confirming.** This is the one action in the panel
that cannot be undone by editing a field back — it ships the goods and books the
revenue.

### Unpaid orders give their stock back

An order holds its stock from the moment it is placed, so one nobody pays for
takes a garment off sale. After 24 hours it is cancelled and the stock returns.
The order stays visible as expired rather than disappearing, so you can see what
you nearly sold.

A shopper who has said they paid is **never** swept away — their money may
already be sitting in the account unread. Those wait for you.

### Who can confirm money

`payment.verify`, and it is deliberately not part of `order.manage`. Typing a
tracking number and declaring a ₹40,000 transfer received are different acts.
**operations** and **owner** hold it; support and analyst can read the queue and
not act on it.

---

## Orders

Open an order to change its status or mark payment — both save the moment you
pick them. The **tracking number has its own Save button** (or press Enter);
it used to save on blur, which lost the number if you typed it and closed the
dialog.

Whatever you change is visible to the shopper on their own account page straight
away, tracking number included.
Statuses run `pending → confirmed → packed → shipped → delivered`, with
`cancelled` and `returned` as terminal states.

`returned` is deliberately distinct from `cancelled`: apparel return rates run an
order of magnitude above most categories, and a shop that cannot tell the two
apart cannot measure the fit problem causing them.

---

### Cancelling, returns and stock

Changing an order's status is what moves its stock, and the dropdown says what
it is about to do before you touch it.

| You change it to | What happens to stock |
| --- | --- |
| **Cancelled**, before it shipped | The items go straight back on sale |
| **Cancelled**, after it shipped | Nothing. Those goods are on a van — putting them back on sale sells the same garment twice. Mark it **returned** once you have them |
| **Returned** | You are asked. Say yes only if the goods are back and sellable |

A return does not restock on its own on purpose: a worn or damaged garment going
straight onto the shelf is worse than one sitting in a box until somebody looks
at it. If you say no and it turns out to be fine, put it back from **Products →
Stock**.

Stock is only ever returned **once** per order, whatever you do to the status
afterwards. Cancelling twice, or cancelling something the expiry sweeper already
released, credits nothing extra.

**Unpaid orders release themselves.** An order awaiting a bank transfer holds its
stock for 24 hours, then cancels and gives it back without anyone touching it.
See **Payments**.

---

## Coupons

Two kinds: a percentage or a fixed amount.

**Always set a cap on a percentage coupon.** "25% off" on a ₹40,000 bag is
₹10,000 the campaign never intended to give. Every coupon is also capped by the
bag subtotal, so a code can never produce a negative total.

`Usage limit` is claimed atomically at checkout — two shoppers redeeming the last
use at the same moment cannot both succeed. Editing a coupon never resets its
usage count.

---

## Reviews

Reviews carry a **fit note** — the single most useful thing a shopper learns from
a stranger is whether a garment ran small. Once three or more reviews agree by a
real majority, the product page says "Runs small — consider sizing up".

Removing a review recalculates the product's star rating from what remains, so a
card can never disagree with its own review list.

---

## What a shopper sees in their own account

The storefront account page has five tabs, so a merchant knows what a customer
can already do without asking:

| Tab | Contains |
| --- | --- |
| Orders | Full history, expandable to lines, address, tracking and the itemised total |
| Profile | Name, phone, marketing opt-in. Email is read-only — it identifies the account and receipts go to it |
| Addresses | Add, edit, delete, set default |
| Payments | Saved cards and UPI handles |
| Security | Change password, current password required |

Saved cards keep **only** the network, the last four digits and the expiry. No
card number, no CVV, no chargeable token — a real gateway holds those, and this
shop deliberately cannot.

## Staff

**Staff → Add staff.** Name, email, role and a password of at least 12
characters. The role decides the starting permissions.

### The roles

| Role | Can do |
| --- | --- |
| **owner** | Everything, including settings and staff |
| **merchandiser** | Catalogue, categories, attributes, media, reviews |
| **operations** | Orders, stock, customers, **confirming payments** |
| **support** | Read the catalogue, orders and customers; moderate reviews |
| **analyst** | Read everything **and** export CSV |

Roles are presets over a permission list, not a hierarchy. Someone who needs one
extra thing gets that permission rather than a bigger role.

**Changing the role re-applies that role's permissions.** Promoting support to
operations grants `order.manage` and drops `review.moderate`. For a while it did
not — the label moved and the access stayed put — so if you remember it behaving
that way, it no longer does.

### Changes take effect immediately

Permissions are read from the database on every request, not baked into the sign-in
token. Revoking access stops the next action, not the next login — someone who
should not have a permission does not keep it for the rest of the week.

The same applies to **Disable**: that person's next click lands on the sign-in
screen, mid-session.

You cannot deactivate your own account. Locking yourself out is a support ticket
nobody can resolve from inside the product.

### If someone hits a wall

They see a page naming the exact permission they are missing, e.g.
*"Your account (support) is missing `promotion.manage`."* That is deliberate —
"Forbidden" leaves them guessing, a named permission lets them ask you for exactly
that one.

---

## Your own account

Your name sits at the bottom of the sidebar, above **Sign out**. Click it.

| Card | What it does |
| --- | --- |
| **Account** | Change your display name. Your email is shown but locked — it identifies the account and is where a reset link goes, so only an owner can change it, from **Staff**. |
| **Change password** | Requires your current password. Twelve characters minimum. |
| **Access** | Read-only: your role, how many of the fifteen permissions you hold, when you last signed in, and every permission with the ones you have highlighted. |

**Access is read-only on purpose.** The endpoint behind this page ignores
`role`, `permissions` and `isActive` even if they are sent, so the profile
screen cannot become a way to promote yourself. The suite asserts all three.

Renaming yourself updates the sidebar immediately — no sign-out needed.

---

## Forgotten passwords

**Sign-in screen → "Forgot your password?"** Enter the email, and a reset link
is queued.

Two things about that screen are deliberate:

- **The reply is the same whether or not the address has an account.** Otherwise
  anyone could use it to find out who works here.
- **A link works once and expires after an hour.** Requesting a new one retires
  the outstanding link, so a forwarded old email is dead.

Only a hash of the token is stored, and the token appears in neither the outbox
row's metadata nor anywhere the **Emails** page can show it. If you lose the
link, request another — nobody, including an owner, can look the old one up.

Shoppers have the same flow at `/reset-password` on the shop.

> **Where do the emails go?** Nowhere yet. Every message is written to the
> outbox and listed under **Emails** with status `recorded` — not `sent`, because
> nothing has been sent. Point `EmailDelivery` at a real provider and the same
> messages go out for real. Recording them was the honest default: a shop that
> claims to have emailed a customer when it has not is worse than one that
> plainly has not.

---

## Journal & pages

**Catalogue → Journal & pages.** Two tabs.

### Journal

The shop's blog, at `/journal`. **New entry** opens the editor.

| Field | Notes |
| --- | --- |
| Title | Required |
| Slug | Leave empty and it is built from the title |
| Category | Becomes a filter chip on the journal page. Type a new one and the chip appears — the list is derived from what exists, never a fixed set |
| Read time | Minutes, shown under the title |
| Status | **Draft** hides it from the shop entirely; the URL 404s |
| Excerpt | The line under the title on the list page |
| Cover image | Paste a URL — upload under **Media** first if it is your own photo. A preview renders underneath so a broken URL is obvious before you publish |
| Linked products | Comma-separated slugs. They render as real product cards at the foot of the entry, priced and in stock as of the moment someone reads it |
| Body | Blank line between paragraphs, `## ` at the start of a line for a heading |

**The body is rendered as text, never as HTML.** Pasting markup will show the
markup. That is the point: a blog editor that renders arbitrary HTML is a way to
run a script on every shopper's browser.

An entry with no cover image is laid out as a single measured column rather than
leaving half the row blank, so leaving it off is a real choice.

### Pages

The footer pages — delivery and returns, size and fit, fabrics, about, contact.
The footer builds its columns from whichever pages are published and their
`footerGroup`, so a new page needs no code to be linked from anywhere.

This tab is currently read-only; the page bodies are structured blocks and are
edited through the API. Everything else on this screen writes.
