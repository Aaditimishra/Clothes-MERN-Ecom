# Bugs found and fixed

Every defect caught while building this, what caused it, and why the fix is the
shape it is. Kept because the *reasons* are the reusable part — most of these are
mistakes any e-commerce build makes once.

Each one now has a regression test in `tools/smoke-test.py` unless noted.

---

## 1. Brand filter silently returned nothing

**Symptom.** `?brand=Mercer Denim` returned 0 products. No error — just an empty
grid, which reads as "we don't stock that brand".

**Cause.** The facet emitted the display name (`"Mercer Denim"`), and the query
schema lowercased every incoming filter value. `"mercer denim"` never matched
`"Mercer Denim"`, so the two halves of the same feature disagreed about case.

**Fix.** Products carry a `brandCode` (lowercase, stable) alongside the display
`brand`. Facets emit the code and filters match the code, so neither side can
drift. The display name is free to be renamed without breaking a single URL.

**Why it hid.** An empty result set is a *valid* answer. Nothing throws, nothing
logs, and the page looks fine.

---

## 2. Ratings on cards disagreed with the reviews below them

**Symptom.** A product card read "4.2 (178 reviews)" and its own review section
said "No reviews yet".

**Cause.** The seed wrote an invented `ratingAverage` and `reviewCount` onto each
product without creating any review documents.

**Fix.** The seed writes 130 real reviews and *derives* the rating from them. The
denormalised fields are recalculated from the full review set on every write, so
a card can never disagree with its own list.

---

## 3. A colour swatch opened on a different colour

**Symptom.** Clicking "White" showed a blue shirt.

**Cause.** Photographs lived in one pool on the product, and the seed handed
image *n* to colourway *n* by index. Where a product had two photos and three
colours, it wrapped around and reused whatever was there.

**Fix.** Each colourway names its own photographs in the data. Some colourways
now have one image rather than three, which is the honest outcome — padding a
gallery from the shared pool is exactly what produced the mismatch.

Every seeded image was then checked by eye against the swatch it sits under.

---

## 4. Two dead image URLs

**Symptom.** Two product galleries rendered a broken-image icon.

**Cause.** Two Unsplash ids had been removed upstream.

**Fix.** All 45 ids verified with a HEAD request; the two 404s replaced. Worth
noting the class of problem: **external assets rot**, which is one reason the
admin can now replace any image without a deployment.

---

## 5. Category counts read `(0)` on every parent

**Symptom.** The mega menu showed `Women (0)` above `Dresses (3)`.

**Cause.** Products are filed against leaf categories, and the count aggregation
grouped by the exact category id.

**Fix.** Counts roll **up** the materialised path — each product contributes to
its own category and to every ancestor.

---

## 6. Uploaded images 404'd on the storefront

**Symptom.** An image uploaded in the admin appeared there but broke on the shop,
showing alt text instead. Confusingly, the seeded images kept working.

**Cause.** The admin's Vite config proxied `/uploads`; the storefront's did not.
Seeded images are absolute external URLs, so they bypassed the proxy entirely and
masked the gap.

**Fix.** The storefront proxies `/uploads` too.

**Why it hid.** `curl` against the API returned 200 the whole time. Only a real
browser loading the page through Vite reproduced it.

---

## 7. Saving one colour wiped the rest of the theme

**Symptom.** After a settings save, the hero body copy was empty and the palette
had reverted.

**Cause.** `saveSettings` did `$set: { branding: {...} }`. Mongo **replaces** a
nested object wholesale, so a partial save of `{ accent }` deleted the other
thirteen colours, both fonts and the hero copy.

**Fix.** The patch is flattened to dot paths — `{'branding.accent': …}` — which
updates one leaf and leaves its siblings alone. Arrays are still set whole,
because removing the third tax band has to actually remove it.

**Why it matters.** The worst kind of bug: silent, destructive, and triggered by
the most ordinary action a merchant can take.

---

## 8. Viewing a resource granted exporting all of it

**Symptom.** An `operations` account, meant for stock and orders, could download
every customer's email, phone and lifetime value.

**Cause.** The export routes were gated on the same permission as the list pages.

**Fix.** `data.export` is its own permission, required *in addition to* the
resource permission. Reading one customer to answer a ticket and exporting all of
them are different acts with different risk. A new `analyst` role holds it.

---

## 9. The checkout address was never saved

**Symptom.** The account page said "one is saved automatically when you check
out". It wasn't. The list stayed empty.

**Cause.** The feature was described in the UI and never implemented.

**Fix.** Checkout files the delivery address into the customer's address book,
deduplicated on street line + PIN so correcting a typo in a name does not create
a second copy. Failures are swallowed — an order that succeeded must not report
failure because a convenience feature did not work.

**Why it matters.** Promising something and not doing it is worse than not
offering it: the shopper trusts the message, finds nothing next time, and retypes
the whole address.

---

## 10. The bag badge still showed items after checkout

**Symptom.** On the confirmation page — having just paid — the header still said
"2".

**Cause.** `forgetCart` called `removeQueries`, which drops the cache entry but
leaves the mounted observer holding its last result until a refetch lands.

**Fix.** The empty bag is *written* into the cache synchronously, then invalidated
to reconcile with the server. Nothing stale is on screen in between.

---

## 11. A tracking number typed into the order dialog vanished

**Symptom.** Status changes saved; the tracking number silently did not.

**Cause.** The field saved on blur. Inside a modal that is a trap: type the
number, click the close button, and the dialog unmounts before the blur handler
runs. The hint even read "Press Tab to save", asking the user to know an
implementation detail.

**Fix.** An explicit **Save** button that reads "Saved" once clean, plus Enter to
submit.

Blur-to-save was kept for the variant grid — that is a table, it does not close,
and it now shows a "✓ Saved" flag after each cell.

---

## 12. Changing a staff role changed nothing

**Symptom.** Promoting someone from `support` to `operations` renamed their role
and left them with exactly the access they had before.

**Cause.** The admin sent `permissions: undefined`, which `JSON.stringify` drops,
so the server received only `{ role }` and left permissions untouched.

**Fix.** Changing the role re-applies that role's preset server-side. An explicit
permission list still wins, which is how one person gets a customised role.

**Why it hid.** The dropdown updated, the row updated, a success toast appeared.
Everything looked right except what actually mattered.

---

## 13. Admin routes had no permission guard

**Symptom.** A support user typing `/settings` got a loading skeleton that never
resolved.

**Cause.** The sidebar hid the link, but the route still mounted. Its data request
came back 403, so `isLoading` went false while the data stayed undefined — the
skeleton condition was true forever.

**Fix.** Every route is wrapped in `<RequirePermission>`, which renders a clear
denial **naming the missing permission**. Told only "forbidden", someone has to
guess; told which permission is missing, they can ask for exactly that.

**Note.** Data was never at risk — the API refused correctly throughout. This was
a dead end where an explanation should have been.

---

## 14. The base price field lied about what it did

**Symptom.** A merchant changing "Price" in the product editor saw existing
variants keep their old prices.

**Cause.** Deliberate — overwriting them would wipe the per-size ladder and any
manual override the moment someone added a colour. But the label did not say so.

**Fix.** The hint now states it seeds new combinations only, **and** a separate
"Apply ₹X to all N variants" button does the bulk change. Both needs are real:
saving must not quietly reprice untouched things, and repricing a line must not
take thirty edits.

---

## 15. "Remove" sat under the price instead of the details

**Symptom.** In the bag drawer on a phone, the Remove link floated centred below
the line total rather than sitting under the item it removes.

**Cause.** It is a CSS grid item, so it stretched to the full column width and its
text centred inside.

**Fix.** `justify-self: start`.

---

## 16. The cart line was squeezed at phone width

**Symptom.** At 390px the three-column cart row pushed the price into the top
right, level with the brand name and visually detached from the product.

**Fix.** Below 560px the row becomes two columns and the price moves onto its own
line under the details, so the whole thing reads as one block.

**The interesting part** was the first attempt not working: the override was
written *above* the base `.cart-line-price` rule. A media query adds no
specificity, so the later rule won and the fix did nothing. Moved below.

---

## 17. The admin nav ate the whole phone screen

**Symptom.** On a 390×844 screen the first row of every table sat **700px** down.
A merchant opening Products scrolled past the entire menu to reach anything.

**Cause.** Below 900px the sidebar simply became `position: static`, so the
twelve-item nav stacked above the content as an ordinary block.

**Fix.** Off-canvas drawer with a burger in a compact mobile bar: content now
starts at y=52. The drawer closes on navigation and on Escape, dims the page
behind it, and locks body scroll while open.

---

## 18. Admin toolbars ran off the side of the screen

**Symptom.** Products and Orders scrolled horizontally on a phone — the search
box, the status filter and two buttons came to **690px** on a 390px screen, and
took the whole page sideways with them.

**Fix.** Below 900px the toolbar wraps onto a second row and its inputs flex down
to a shared minimum instead of holding fixed widths.

---

## 19. Four attribute tabs were unreachable on mobile

**Symptom.** The Attributes screen has ten tab buttons totalling 649px. Inside a
390px card with `overflow: hidden`, the last four were not merely off-screen —
they were clipped away with no way to reach them.

**Fix.** `overflow-x: auto` on the tab strip, and the tabs no longer shrink.

---

## 20. Deductions had no sign in the admin

**Symptom.** The admin's order totals showed `Discount on MRP ₹2,600` while the
shopper's copy of the same order showed `−₹2,600`.

**Fix.** Deductions carry a minus and the same green. Two views of one order
should not disagree about which way the money went.

---

## 21. `const view` shadowed itself and broke every checkout

**Symptom.** Every order returned 500 with `Cannot access 'view2' before
initialization`. No order could be placed at all.

**Cause.** A `const view` declared inside a block shadowed an outer `view` that
the same block read earlier. Block-scoped shadowing is legal TypeScript, so the
compiler had nothing to complain about — it is a runtime temporal-dead-zone
error only.

**Fix.** Renamed the inner binding to `placed`. The lesson is that a typecheck
passing is not the same as a path being exercised; this was found by placing an
order, not by building.

---

## 22. Content step lists wrapped one word per line

**Symptom.** Numbered steps on the content pages rendered as a column of single
words.

**Cause.** The list is a two-column grid — counter, then text — but the
paragraph inside each `li` was auto-placed into the 30px counter column.

**Fix.** `.content-steps li > * { grid-column: 2; }`. Grid auto-placement puts
children wherever they fit, which is rarely where you meant.

---

## 23. Editing content in the admin did not change the shop for five minutes

**Symptom.** A journal entry was edited in the admin, saved, and confirmed
changed in the database — and the shop kept serving the old copy. Reloading did
not help.

**Cause.** The storefront's content endpoints sent `Cache-Control: public,
max-age=300`. The browser had a valid copy and never asked the server for a new
one.

**Why it mattered more than it looks.** This is indistinguishable from a broken
save. The merchant edits, reloads, sees no change, and has no way to tell
whether the save failed, the feature is broken, or they are looking at a cache.

**Fix.** Every merchant-editable endpoint now sends `Cache-Control: no-cache`,
which means "keep the copy but ask before using it", not "do not store".
Express already sends an ETag, so an unchanged response still costs one 304 with
an empty body — nearly as cheap as the timed cache and never wrong. Asserted in
the suite: no `max-age`, an ETag present, and a conditional request answered
with 304.

---

## 24. The admin journal list dropped fields the editor writes back

**Symptom.** Found by writing the test before trusting the screen: `GET
/admin/journal` returned neither `isPublished` nor `productSlugs`.

**Why it would have bitten.** The editor loads a record, and saves back what it
was handed. Any field missing from the list is therefore erased on the next
save — fixing a typo in a post would have unpublished it and cut its product
links.

**Fix.** A dedicated `PostAdminView` carries both, and `savePost` returns the
same shape so a save response can be trusted too. Three checks now assert the
round-trip.

---

## 25. The `.summary` detail lists had no styles at all

**Symptom.** The profile's access panel and the email detail rendered as a bare
browser `<dl>` — every term and value on its own line.

**Cause.** The class was used in two admin screens and defined in neither.

**Fix.** A grid that lays out the term/value pairs, collapsing to one column on
a phone. The first attempt targeted `dt`/`dd` as the grid children when each
pair is actually wrapped in a `div` — it looked passable by accident, which is
its own kind of wrong.

---

## 26. A journal entry with no cover left half the row empty

**Symptom.** The newest entry runs wide in a two-column lead. Written without a
cover photo, it rendered as text in the left column and a large blank space in
the right.

**Fix.** The lead collapses to a single measured column when there is no image.
An optional field has to look deliberate when it is absent.

---

## 27. `tsc --pretty` hid three typecheck errors from me

**Symptom.** I reported a clean typecheck several times while
`content.service.ts` had three errors.

**Cause.** `npx tsc --pretty | grep -c "error TS"` counts nothing: pretty output
colours the word `error`, so an escape sequence sits between `error` and `TS`
and the literal substring never matches.

**Fix.** Every typecheck in this project now runs `--pretty false`. This is the
second time a grep that silently matched nothing was mistaken for a passing
check — the other is in the harness list below.

---

## Not bugs, confirmed working

Things that looked wrong during testing and turned out to be correct:

- **`POST /cart/items` with `quantity: 99` returns 400.** The per-request cap is
  10. The *cumulative* case clamps instead: 8 in the bag plus 5 more becomes 10,
  not an error dialog. Two different rules, both intended.
- **The sign-in rate limiter blocked the test suite** on its eleventh attempt in
  fifteen minutes. Working as designed. The suite now reports 429 with
  instructions instead of failing with `KeyError: 'token'`.
- **The base price not touching existing variants** — see #14. Safe by design,
  now also honest.

---

## Bugs in the test harness itself

Worth listing, because they cost real debugging time:

- **A synthetic `blur` event does nothing.** React listens on `focusout`. Two
  "failures" were the harness, not the app; both features worked under a real
  focus change.
- **`for kind, must in [...]` shadowed the `must()` helper**, so a later call
  failed with `'str' object is not callable` far from the cause.
- **zsh does not word-split an unquoted variable.** `for wh in "390 844"` with
  `set -- $wh` passed `"390 844"` as a single argument, so the width parsed as
  `NaN` and the mobile suite silently ran at desktop width — reporting a clean
  bill of health that meant nothing. The check now asserts the emulated viewport
  matches what was asked for and says so loudly when it does not.
- **A device-metrics override can be dropped by a navigation.** Re-asserted after
  every `Page.navigate` for the same reason: a silently-desktop run is worse than
  no run.
- **A `loading="lazy"` image below the fold reports `naturalWidth === 0`.** A
  sweep that counted those as broken images reported four failures on pages that
  were fine. The check now scrolls the page to the bottom first, the way a
  person would, before deciding anything is missing. Two of the four "broken"
  URLs returned HTTP 200 when tested directly, which is what gave it away.
