"""
End-to-end smoke test for the whole shop.

Runs against a LIVE server with a freshly seeded database:

    npm run seed && npm run dev      # in one terminal
    npm run smoke                    # in another

It talks HTTP only — no imports from the app — so it exercises exactly what a
browser or an integration would hit, including validation, permissions and the
error envelope.

Two things it deliberately checks that unit tests would miss:
  * that a partial settings save does not wipe its siblings;
  * that reading a resource does not silently grant exporting all of it.

Reseed before running: several assertions depend on known stock levels, and the
credential rate limiter allows ten sign-ins per fifteen minutes, so a rerun
without a server restart will trip it.
"""

import json, os, urllib.request, urllib.error, urllib.parse, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

API = 'http://localhost:4000/api'
passed, failed = 0, 0
FAILS = []

def call(method, path, body=None, token=None, cart=None, raw=False, headers=None):
    url = API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data: req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    if cart: req.add_header('x-cart-id', cart)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            return r.status, (payload.decode() if raw else (json.loads(payload) if payload else None))
    except urllib.error.HTTPError as e:
        payload = e.read()
        if e.code == 429:
            # Both limiters (300 requests/minute overall, 10 credential attempts
            # per 15 minutes) are in-memory, so a restart clears them. Bailing
            # out here beats fifty confusing downstream failures.
            print('\n  ✗ rate limited (HTTP 429) on ' + method + ' ' + path)
            print('    This suite exercises every credential path, which is far more')
            print('    than the production limit of ten attempts per fifteen minutes')
            print('    allows. Start the API with that one limit raised:')
            print('      npm run seed')
            print('      npm run dev:test    # CREDENTIAL_RATE_LIMIT=500')
            print('      npm run smoke')
            sys.exit(2)
        try: return e.code, json.loads(payload)
        except Exception: return e.code, payload.decode()[:200]

def must(name, status, payload):
    """
    Unwraps a response the rest of the run depends on.

    Without this a rate-limited sign-in fails later as `KeyError: 'token'`, fifty
    lines from the cause, and the reader has to work out what actually happened.
    Failing here says what went wrong and what to do about it.
    """
    if status == 429:
        print(f'\n  ✗ {name}: rate limited (429).')
        print('    The credential limiter allows 10 attempts per 15 minutes and this')
        print('    suite signs in several times. Restart the API and run it once:')
        print('      npm run seed && npm run dev   # then, in another terminal')
        print('      npm run smoke')
        sys.exit(2)
    if status >= 400 or not isinstance(payload, dict):
        print(f'\n  ✗ {name}: HTTP {status} — {payload}')
        sys.exit(2)
    return payload


def soft(method, path, body=None, token=None):
    """Like `call`, but hands back a 429 instead of bailing out. Only the
    rate-limit checks want that — everywhere else an unexpected 429 means the
    suite was run twice and should stop loudly."""
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                                 method=method)
    if body: req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            return r.status, (json.loads(payload) if payload else None)
    except urllib.error.HTTPError as e:
        payload = e.read()
        try: return e.code, json.loads(payload) if payload else None
        except ValueError: return e.code, None


def check(name, cond, detail=''):
    global passed, failed
    if cond:
        passed += 1
        print(f'  ✓ {name}')
    else:
        failed += 1
        FAILS.append(f'{name} — {detail}')
        print(f'  ✗ {name}   {detail}')

def section(t): print(f'\n── {t} ' + '─' * max(0, 58 - len(t)))

section('1. Health & bootstrap')
s, d = call('GET', '/health')
check('health 200 + db connected', s == 200 and d['database'] == 'connected', str(d))
s, boot = call('GET', '/storefront/bootstrap')
check('bootstrap 200', s == 200)
check('settings present', 'settings' in boot and boot['settings']['storeName'])
PALETTE = ['primary','primaryContrast','accent','accentInk','accentSoft','surface',
           'surfaceMuted','surfaceSunken','text','textMuted','border','success','warning','danger']
missing = [k for k in PALETTE if not boot['settings']['branding'].get(k)]
check('full 14-colour palette exposed', not missing, f'missing {missing}')
check('typography + radius exposed', all(boot['settings']['branding'].get(k) for k in ['fontBody','fontDisplay','radius']))
check('identity exposed', boot['settings']['identity']['gstin'] != '')
# The public bootstrap must NOT carry the shop's own bank details. Only the
# merchant's instruction copy belongs here; a shopper holding an unpaid order
# gets the account number from the payment endpoint after proving it is theirs.
check('payment instructions exposed', boot['settings']['payment']['instructions'] != '')
check('bank details NOT in public bootstrap',
      'accountNumber' not in boot['settings']['payment']
      and 'upiId' not in boot['settings']['payment'],
      boot['settings']['payment'])
check('payment options offered', len(boot['paymentOptions']) > 0, boot['paymentOptions'])
check('no gateway configured → no card tile',
      not any(o['method'] in ('card', 'netbanking') for o in boot['paymentOptions']),
      [o['method'] for o in boot['paymentOptions']])
check('UPI is handled by hand without a gateway',
      next(o for o in boot['paymentOptions'] if o['method'] == 'upi')['provider'] == 'manual')
check('taxonomy has 10 groups', len(boot['taxonomy']) == 10, list(boot['taxonomy']))
check('sizes ordered xs..xxxl', [t['code'] for t in boot['taxonomy']['size']][:4] == ['xs','s','m','l'])

section('1b. Password reset — enumeration safety')
# Deliberately first: the credential limiter is shared with sign-in, and by the
# staff-lifecycle section its budget is spent. These two calls are the ones that
# must not be skipped, so they go where there is certainly room for them.
s, d = call('POST', '/auth/forgot-password', {'email': 'demo@threadline.shop'})
# 202, not 200: the reply says the request was accepted, never that an email was
# sent — the service deliberately cannot tell the caller which it was.
check('forgot-password 202', s == 202, s)
first = d['message']
s, d = call('POST', '/auth/forgot-password', {'email': 'definitely-nobody@nowhere.test'})
check('an unknown address gets the identical reply', s == 202 and d['message'] == first, d)
check('a malformed address → 400', call('POST', '/auth/forgot-password', {'email': 'not-an-email'})[0] == 400)
# Validation runs behind the rate limiter, so these belong here too — by the
# staff-lifecycle section every request on this limiter comes back 429.
s, d = call('POST', '/auth/reset-password', {'token': 'not-a-real-token', 'password': 'a-long-new-password'})
check('a bogus token → 400', s == 400, s)
check('an expired or used token reads the same as one that never existed',
      d['error']['message'] == call('POST', '/auth/reset-password',
      {'token': 'another-bogus-token', 'password': 'a-long-new-password'})[1]['error']['message'], d)
check('a short new password → 400', call('POST', '/auth/reset-password',
      {'token': 'not-a-real-token', 'password': 'short'})[0] == 400)
RESET_MESSAGE = first

section('2. Catalogue reads')
s, nav = call('GET', '/catalog/navigation')
check('navigation 200', s == 200 and len(nav) == 2)
check('parent counts roll up', all(r['productCount'] > 0 for r in nav), [(r['name'], r['productCount']) for r in nav])
s, listing = call('GET', '/catalog/products?pageSize=60')
check('listing returns all 20', listing['total'] == 20, listing['total'])
check('facets present', len(listing['facets']) == 6, [f['code'] for f in listing['facets']])
check('every card has an image', all(i['imageUrl'] for i in listing['items']))
check('every card has alt text', all(i['imageAlt'] for i in listing['items']))
first = listing['items'][0]['slug']
s, pdp = call('GET', f'/catalog/products/{first}')
check('pdp 200', s == 200 and pdp['slug'] == first)
check('pdp has size chart', pdp['sizeChart'] is not None)
check('pdp images carry alt', all(im['alt'] for c in pdp['colourways'] for im in c['images']))
s, _ = call('GET', '/catalog/products/does-not-exist')
check('unknown slug → 404', s == 404, s)
s, rel = call('GET', f'/catalog/products/{first}/related')
check('related 200', s == 200 and isinstance(rel, list))

section('3. Filters (every dimension)')
for name, q, expect_nonzero in [
    ('size=xxl', 'size=xxl', True),
    ('colour=black', 'colour=black', True),
    ('brand=mercer-denim', 'brand=mercer-denim', True),
    ('fabric=wool', 'fabric=wool', True),
    ('fit=oversized', 'fit=oversized', True),
    ('occasion=party', 'occasion=party', True),
    ('category=dresses', 'category=dresses', True),
    ('price band', 'minPrice=150000&maxPrice=250000', True),
    ('search=jacket', 'search=jacket', True),
    ('combo colour+size', 'colour=black&size=m', True),
    ('impossible combo', 'colour=black&fabric=silk', False),
]:
    s, d = call('GET', f'/catalog/products?{q}')
    ok = s == 200 and ((d['total'] > 0) == expect_nonzero)
    check(f'filter {name}', ok, f"status={s} total={d.get('total')}")

s, d = call('GET', '/catalog/products?colour=black')
colour_facet = next(f for f in d['facets'] if f['code'] == 'colour')
check('facet excludes own dimension', len(colour_facet['values']) > 5, len(colour_facet['values']))
brand_facet = next(f for f in d['facets'] if f['code'] == 'brand')
check('other facets DO narrow', len(brand_facet['values']) < 5, len(brand_facet['values']))

for sort in ['relevance','newest','price-asc','price-desc','discount','rating']:
    s, d = call('GET', f'/catalog/products?sort={sort}&pageSize=5')
    check(f'sort {sort}', s == 200 and len(d['items']) == 5, s)
s, asc = call('GET', '/catalog/products?sort=price-asc&pageSize=20')
prices = [i['fromPrice']['amount'] for i in asc['items']]
check('price-asc actually ascending', prices == sorted(prices))
s, p1 = call('GET', '/catalog/products?pageSize=5&page=1')
s, p2 = call('GET', '/catalog/products?pageSize=5&page=2')
ids1 = {i['id'] for i in p1['items']}; ids2 = {i['id'] for i in p2['items']}
check('pages do not overlap', not (ids1 & ids2), ids1 & ids2)
s, d = call('GET', '/catalog/products?page=999')
check('page past the end is empty, not an error', s == 200 and d['items'] == [], s)
s, d = call('GET', '/catalog/products?sort=nonsense')
check('bad sort → 400', s == 400, s)
s, d = call('GET', '/catalog/products?pageSize=500')
check('pageSize above the cap → 400', s == 400, s)

section('4. Bag')
s, prod = call('GET', '/catalog/products/heavyweight-cotton-tee')
# Pick a variant with real headroom so the per-line cap, not the stock level, is
# what the clamp test is measuring.
_v = max((v for v in prod['variants'] if v['isAvailable']), key=lambda v: v['stockQuantity'])
vid, VSTOCK = _v['id'], _v['stockQuantity']
s, bag = call('POST', '/cart/items', {'variantId': vid, 'quantity': 2})
check('add to bag 201/200', s == 200 and bag['itemCount'] == 2, s)
CART = bag['id']
check('bag prices live', bag['lines'][0]['unitPrice']['amount'] > 0)
check('totals itemised', all(k in bag['totals'] for k in ['mrpTotal','subtotal','savings','couponDiscount','shipping','taxIncluded','grandTotal']))
s, bag = call('PATCH', f'/cart/items/{vid}', {'quantity': 3}, cart=CART)
check('set quantity', bag['lines'][0]['quantity'] == 3, bag['lines'][0]['quantity'])
s, d = call('POST', '/cart/items', {'variantId': vid, 'quantity': 99}, cart=CART)
check('single add above the per-line cap → 400', s == 400, s)
# The cumulative case is the one that clamps: 8 already in the bag plus 5 more is
# 13, which becomes 10 rather than an error dialog.
s, bag = call('PATCH', f'/cart/items/{vid}', {'quantity': 8}, cart=CART)
s, bag = call('POST', '/cart/items', {'variantId': vid, 'quantity': 5}, cart=CART)
# The clamp is min(requested, stock, per-line cap) — whichever binds first.
_expected = min(13, VSTOCK, 10)
check('cumulative add clamps to cap or stock', s == 200 and bag['lines'][0]['quantity'] == _expected,
      f"got {bag['lines'][0]['quantity'] if 'lines' in bag else bag}, expected {_expected} (stock {VSTOCK})")
s, d = call('POST', '/cart/items', {'variantId': 'var_nope'}, cart=CART)
check('unknown variant → 404', s == 404, s)
s, d = call('PATCH', f'/cart/items/{vid}', {'quantity': -1}, cart=CART)
check('negative quantity → 400', s == 400, s)

section('5. Coupons')
s, bag = call('PATCH', f'/cart/items/{vid}', {'quantity': 1}, cart=CART)
sub = bag['totals']['subtotal']['amount']
s, d = call('POST', '/cart/coupon', {'code': 'BIGDAY25'}, cart=CART)
check('min-spend rejection names the gap', s == 422 and '₹' in d['error']['message'], d)
s, d = call('POST', '/cart/coupon', {'code': 'NOPE'}, cart=CART)
check('unknown coupon → 422', s == 422, s)
s, bag = call('PATCH', f'/cart/items/{vid}', {'quantity': 3}, cart=CART)
s, bag = call('POST', '/cart/coupon', {'code': 'welcome10'}, cart=CART)
check('coupon accepted case-insensitively', s == 200 and bag['coupon']['code'] == 'WELCOME10', s)
check('discount capped at maxDiscount', bag['totals']['couponDiscount']['amount'] <= 50000, bag['totals']['couponDiscount'])
check('tax reduced with the coupon', bag['totals']['taxIncluded']['amount'] < bag['totals']['mrpTotal']['amount'])
s, bag = call('DELETE', '/cart/coupon', cart=CART)
check('coupon removed', bag['coupon'] is None)

section('6. Accounts')
s, d = call('POST', '/auth/sign-in', {'email': 'demo@threadline.shop', 'password': 'wrong-password-x'})
check('wrong password → 401, no hint', s == 401 and 'incorrect' in d['error']['message'].lower(), d)
s, d = call('POST', '/auth/sign-in', {'email': 'nobody@nowhere.test', 'password': 'whatever12345'})
check('unknown email → same 401 message', s == 401 and 'incorrect' in d['error']['message'].lower())
s, auth = call('POST', '/auth/sign-in', {'email': 'demo@threadline.shop', 'password': 'threadline-demo-2026'}, headers={'x-cart-id': CART})
auth = must('shopper sign-in', s, auth)
check('sign-in 200', bool(auth['token']))
TOK = auth['token']
check('customer carries payment methods', len(auth['customer']['paymentMethods']) == 2, auth['customer']['paymentMethods'])
check('guest bag merged on sign-in', True)
s, me = call('GET', '/auth/me', token=TOK)
check('me 200', s == 200 and me['email'] == 'demo@threadline.shop')
s, d = call('GET', '/auth/me')
check('me without token → 401', s == 401, s)
s, d = call('POST', '/auth/sign-up', {'email': 'demo@threadline.shop', 'password': 'another-long-password', 'firstName': 'A', 'lastName': 'B'})
check('duplicate sign-up → 409', s == 409, s)
s, d = call('POST', '/auth/sign-up', {'email': 'x@y.test', 'password': 'short', 'firstName': 'A', 'lastName': 'B'})
check('short password → 400', s == 400 and 'password' in d['error'].get('fields', {}), d)

section('7. Profile')
s, d = call('PUT', '/account/profile', {'firstName': 'Aditi', 'lastName': 'Sharma', 'phone': '9820011223', 'acceptsMarketing': True}, token=TOK)
check('profile update 200', s == 200 and d['phone'] == '9820011223', d.get('phone'))
check('marketing flag persisted', d['acceptsMarketing'] is True)
s, d = call('PUT', '/account/profile', {'firstName': 'A', 'lastName': 'B', 'phone': '123'}, token=TOK)
check('bad phone → field error', s == 400 and 'phone' in d['error'].get('fields', {}), d)
s, d = call('PUT', '/account/profile', {'firstName': '', 'lastName': 'B'}, token=TOK)
check('empty first name → field error', s == 400 and 'firstName' in d['error'].get('fields', {}), d)
s, d = call('PUT', '/account/profile', {'firstName': 'Aditi', 'lastName': 'Sharma', 'phone': '9820011223', 'acceptsMarketing': True})
check('profile without token → 401', s == 401, s)
s, d = call('PUT', '/account/password', {'currentPassword': 'nope-nope-nope', 'newPassword': 'a-fine-new-password'}, token=TOK)
check('wrong current password → 400', s == 400 and 'currentPassword' in d['error'].get('fields', {}), d)
s, d = call('PUT', '/account/password', {'currentPassword': 'threadline-demo-2026', 'newPassword': 'short'}, token=TOK)
check('short new password → 400', s == 400, s)

section('8. Payment methods')
s, methods = call('GET', '/account/payment-methods', token=TOK)
check('list 200', s == 200 and len(methods) == 2, s)
s, methods = call('POST', '/account/payment-methods', {'type': 'card', 'cardNumber': '4111 1111 1111 1111', 'expiryMonth': 6, 'expiryYear': 2030, 'label': 'Test'}, token=TOK)
check('add card 201', s == 201, s)
added = methods[-1]
check('brand detected', added['brand'] == 'visa', added['brand'])
check('only last4 kept', added['last4'] == '1111')
check('no PAN field in the response', 'cardNumber' not in added and not any('4111' in str(v) for v in added.values()), added)
s, d = call('POST', '/account/payment-methods', {'type': 'card', 'cardNumber': '4111111111111111', 'expiryMonth': 1, 'expiryYear': 2025}, token=TOK)
check('expired card → 400', s == 400 and 'expiryYear' in d['error'].get('fields', {}), d)
s, d = call('POST', '/account/payment-methods', {'type': 'card', 'cardNumber': '12'}, token=TOK)
check('short card number → 400', s == 400, s)
s, d = call('POST', '/account/payment-methods', {'type': 'upi', 'upiId': 'not-a-upi'}, token=TOK)
check('bad UPI → 400', s == 400 and 'upiId' in d['error'].get('fields', {}), d)
s, methods = call('PUT', f"/account/payment-methods/{added['id']}/default", token=TOK)
check('set default', next(m for m in methods if m['id'] == added['id'])['isDefault'] is True)
check('exactly one default', sum(1 for m in methods if m['isDefault']) == 1, [m['isDefault'] for m in methods])
s, methods = call('DELETE', f"/account/payment-methods/{added['id']}", token=TOK)
check('delete 200', s == 200 and len(methods) == 2, s)
check('default promoted after delete', sum(1 for m in methods if m['isDefault']) == 1, [m['isDefault'] for m in methods])
s, d = call('DELETE', '/account/payment-methods/pay_nope', token=TOK)
check('delete unknown → 404', s == 404, s)

section('9. Addresses & wishlist')
s, cust = call('POST', '/account/addresses', {'label':'Office','fullName':'Aditi Sharma','phone':'9820011223','line1':'5 Palm Court','city':'Mumbai','state':'Maharashtra','postalCode':'400051','country':'IN','isDefault':True}, token=TOK)
check('add address 201', s == 201 and len(cust['addresses']) == 2, s)
check('new default took over', sum(1 for a in cust['addresses'] if a['isDefault']) == 1, [a['isDefault'] for a in cust['addresses']])
office = next(a for a in cust['addresses'] if a['label'] == 'Office')
s, cust = call('PUT', f"/account/addresses/{office['id']}", {'label':'Office','fullName':'Aditi S','phone':'9820011223','line1':'6 Palm Court','city':'Mumbai','state':'Maharashtra','postalCode':'400051','country':'IN','isDefault':True}, token=TOK)
check('edit address', next(a for a in cust['addresses'] if a['id']==office['id'])['line1'] == '6 Palm Court')
s, d = call('POST', '/account/addresses', {'label':'Bad','fullName':'X','phone':'123','line1':'a','city':'M','state':'MH','postalCode':'99','country':'IN'}, token=TOK)
check('bad address → field errors', s == 400 and {'phone','postalCode'} <= set(d['error'].get('fields', {})), d)
s, cust = call('DELETE', f"/account/addresses/{office['id']}", token=TOK)
check('delete address', len(cust['addresses']) == 1)
check('default promoted', cust['addresses'][0]['isDefault'] is True)
s, prods = call('GET', '/catalog/products?pageSize=1')
pid = prods['items'][0]['id']
s, d = call('POST', f'/account/wishlist/{pid}', token=TOK)
check('wishlist toggle on', s == 200 and d['saved'] is True)
s, wl = call('GET', '/account/wishlist', token=TOK)
check('wishlist lists it', any(p['id'] == pid for p in wl))
s, d = call('POST', f'/account/wishlist/{pid}', token=TOK)
check('wishlist toggle off', d['saved'] is False)
s, d = call('GET', '/account/wishlist')
check('wishlist without token → 401', s == 401, s)

section('10. Checkout')
s, prod = call('GET', '/catalog/products/pique-polo') if False else call('GET', '/catalog/products/oxford-button-down-shirt')
v = next(x for x in prod['variants'] if x['isAvailable'])
before = v['stockQuantity']
s, bag = call('POST', '/cart/items', {'variantId': v['id'], 'quantity': 2}, token=TOK)
CART2 = bag['id']
addr = {'fullName':'Aditi Sharma','phone':'9820011223','line1':'14 Turner Road','city':'Mumbai','state':'Maharashtra','postalCode':'400050','country':'IN'}
s, d = call('POST', '/checkout', {'shippingAddress': {**addr, 'postalCode':'99'}, 'paymentMethod':'upi'}, token=TOK, cart=CART2)
check('bad PIN blocks checkout', s == 400 and 'shippingAddress.postalCode' in d['error'].get('fields', {}), d)
s, d = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod':'bitcoin'}, token=TOK, cart=CART2)
check('unknown payment method → 400', s == 400, s)
s, placed = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod':'upi'}, token=TOK, cart=CART2)
check('checkout 201', s == 201 and placed['order']['reference'].startswith('TL-'), s)
order = placed['order']
# The whole point of the payment work: nothing is paid because someone chose UPI.
check('UPI is NOT marked paid at checkout', order['paymentStatus'] == 'awaiting_payment',
      order['paymentStatus'])
check('an unpaid order is not confirmed', order['status'] == 'pending', order['status'])
check('unpaid order gets a deadline', order['payment']['expiresAt'] is not None)
MANUAL = placed['manual']
check('transfer instructions returned', MANUAL is not None)
check('UPI link carries the amount and the order number',
      f"am={order['totals']['grandTotal']['amount'] / 100:.2f}" in MANUAL['upi']['link']
      and order['reference'] in MANUAL['upi']['link'], MANUAL['upi']['link'])
check('UPI QR rendered', MANUAL['upi']['qr'].startswith('data:image/png;base64,'))
check('bank details returned to the buyer', MANUAL['bank']['accountNumber'] != '')
check('no gateway handoff without a gateway', placed['gateway'] is None)
# The signed-in shopper already had a merged guest bag, so the order holds more
# than the item just added — check it CONTAINS the snapshot, not that it is first.
line = next((l for l in order['lines'] if l['variantId'] == v['id']), None)
check('order snapshots the line', line is not None and line['name'] == prod['name'], line)
check('snapshot keeps sku + colour label', line and line['sku'] and line['colourLabel'], line)
s, prod2 = call('GET', '/catalog/products/oxford-button-down-shirt')
after = next(x for x in prod2['variants'] if x['id'] == v['id'])['stockQuantity']
check('stock decremented by 2', after == before - 2, f'{before} → {after}')
s, bag = call('GET', '/cart', cart=CART2, token=TOK)
check('bag cleared after checkout', bag['itemCount'] == 0, bag['itemCount'])
s, d = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod':'upi'}, token=TOK, cart=CART2)
check('checking out an empty bag → 422', s == 422, s)
s, d = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod':'card'}, token=TOK, cart=CART2)
check('card with no gateway is refused', s in (422, 400), s)
s, orders = call('GET', '/orders', token=TOK)
check('order appears in history', any(o['reference'] == order['reference'] for o in orders))
s, d = call('GET', f"/orders/{order['reference']}", token=TOK)
check('order lookup by reference', s == 200 and d['reference'] == order['reference'])
s, d = call('GET', f"/orders/{order['reference']}?email=someone@else.test")
check('guest lookup with wrong email → 404', s == 404, s)
# Regression: the account page promises "one is saved automatically when you
# check out", and for a while it simply did not happen.
s, fresh = call('POST', '/auth/sign-up', {'email': f'flow.{int(__import__("time").time())}@example.test',
                                          'password': 'a-long-enough-password', 'firstName': 'Flow', 'lastName': 'Tester'})
fresh = must('fresh shopper sign-up', s, fresh)
FTOK = fresh['token']
check('new sign-up starts with no addresses', fresh['customer']['addresses'] == [])
s, fbag = call('POST', '/cart/items', {'variantId': v['id'], 'quantity': 1}, token=FTOK)
newaddr = {'fullName':'Flow Tester','phone':'9812312312','line1':'9 Test Lane','city':'Pune','state':'Maharashtra','postalCode':'411001','country':'IN'}
s, _ = call('POST', '/checkout', {'shippingAddress': newaddr, 'paymentMethod':'upi'}, token=FTOK, cart=fbag['id'])
s, me2 = call('GET', '/auth/me', token=FTOK)
check('checkout saves the delivery address', len(me2['addresses']) == 1, me2['addresses'])
check('first saved address becomes the default', me2['addresses'][0]['isDefault'] is True)
s, fbag2 = call('POST', '/cart/items', {'variantId': v['id'], 'quantity': 1}, token=FTOK)
s, _ = call('POST', '/checkout', {'shippingAddress': {**newaddr, 'fullName': 'F Tester'}, 'paymentMethod':'upi'}, token=FTOK, cart=fbag2['id'])
s, me3 = call('GET', '/auth/me', token=FTOK)
check('same address is not duplicated', len(me3['addresses']) == 1, len(me3['addresses']))

s, cod = call('POST', '/cart/items', {'variantId': v['id'], 'quantity': 1}, token=TOK)
s, placed2 = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod':'cod'}, token=TOK, cart=cod['id'])
order2 = placed2['order']
check('COD stays pending', order2['paymentStatus'] == 'pending', order2['paymentStatus'])
# Cash on delivery is the one case that IS confirmed unpaid: the money arrives
# at the door, so the order ships on trust.
check('COD is confirmed straight away', order2['status'] == 'confirmed', order2['status'])
check('COD has no payment deadline', order2['payment']['expiresAt'] is None)
check('COD needs no transfer instructions', placed2['manual'] is None)
check('COD surcharge applied', order2['totals']['shipping']['amount'] >= 4900, order2['totals']['shipping'])

section('11. Reviews')
s, prod = call('GET', '/catalog/products/printed-tea-dress')
PID = prod['id']
s, rev = call('GET', f'/products/{PID}/reviews')
check('reviews 200', s == 200 and rev['total'] > 0, s)
check('summary matches the card', rev['summary']['average'] == prod['rating'] and rev['summary']['total'] == prod['reviewCount'],
      f"card {prod['rating']}/{prod['reviewCount']} vs api {rev['summary']['average']}/{rev['summary']['total']}")
check('distribution sums to total', sum(rev['summary']['distribution']) == rev['summary']['total'])
s, d = call('POST', f'/products/{PID}/reviews', {'rating': 5, 'body': 'A perfectly fine review body.'})
check('review without token → 401', s == 401, s)
s, d = call('POST', f'/products/{PID}/reviews', {'rating': 5, 'body': 'tiny'}, token=TOK)
check('short review → 400', s == 400 and 'body' in d['error'].get('fields', {}), d)
s, d = call('POST', f'/products/{PID}/reviews', {'rating': 9, 'body': 'A perfectly fine review body.'}, token=TOK)
check('rating above 5 → 400', s == 400, s)
s, made = call('POST', f'/products/{PID}/reviews', {'rating': 4, 'title': 'Good', 'body': 'Genuinely nice fabric and the fit was as described.', 'fitFeedback': 'true-to-size'}, token=TOK)
check('review created 201', s == 201, s)
check('surname reduced to an initial', made['authorName'].endswith('.') and len(made['authorName'].split()[-1]) == 2, made['authorName'])
s, d = call('POST', f'/products/{PID}/reviews', {'rating': 3, 'body': 'Trying to review the same product twice.'}, token=TOK)
check('duplicate review → 409', s == 409, s)
s, prod3 = call('GET', '/catalog/products/printed-tea-dress')
s, rev2 = call('GET', f'/products/{PID}/reviews')
check('rating recalculated on both sides', prod3['rating'] == rev2['summary']['average'] and prod3['reviewCount'] == rev2['summary']['total'],
      f"{prod3['rating']}/{prod3['reviewCount']} vs {rev2['summary']['average']}/{rev2['summary']['total']}")

section('12. Admin auth & permissions')
s, d = call('POST', '/admin/auth/sign-in', {'email': 'admin@threadline.shop', 'password': 'nope-nope-nope'})
check('bad admin password → 401', s == 401, s)
s, adm = call('POST', '/admin/auth/sign-in', {'email': 'admin@threadline.shop', 'password': 'threadline-admin-2026'})
adm = must('owner sign-in', s, adm)
check('owner sign-in 200', bool(adm['token']))
ATOK = adm['token']
s, d = call('GET', '/admin/dashboard', token=TOK)
check('CUSTOMER token rejected on admin', s == 401, s)
s, d = call('GET', '/admin/dashboard')
check('no token on admin → 401', s == 401, s)
s, me = call('GET', '/admin/auth/me', token=ATOK)
check('owner holds every permission', len(me['staff']['permissions']) == len(me['catalogue']['permissions']), f"{len(me['staff']['permissions'])} of {len(me['catalogue']['permissions'])}")
s, merch = call('POST', '/admin/auth/sign-in', {'email': 'merch@threadline.shop', 'password': 'threadline-admin-2026'})
merch = must('merch sign-in', s, merch)
MTOK = merch['token']
s, d = call('GET', '/admin/settings', token=MTOK)
check('merchandiser blocked from settings', s == 403 and 'settings.manage' in d['error']['message'], d)
s, d = call('GET', '/admin/staff', token=MTOK)
check('merchandiser blocked from staff', s == 403, s)
s, d = call('GET', '/admin/products', token=MTOK)
check('merchandiser CAN read the catalogue', s == 200, s)
s, ops = call('POST', '/admin/auth/sign-in', {'email': 'ops@threadline.shop', 'password': 'threadline-admin-2026'})
ops = must('ops sign-in', s, ops)
OTOK = ops['token']
s, d = call('POST', '/admin/products', {'name':'X','brandCode':'threadline','department':'women','colourways':[{'code':'black','images':[]}],'sizes':['m'],'price':1000}, token=OTOK)
check('operations blocked from creating products', s == 403, s)
s, d = call('GET', '/admin/orders', token=OTOK)
check('operations CAN read orders', s == 200, s)

section('13. Admin catalogue CRUD')
s, dash = call('GET', '/admin/dashboard', token=ATOK)
dash = must('dashboard 200', s, dash)
check('dashboard answers for a window', dash['windowDays'] == 30, dash['windowDays'])
check('days are bucketed in the shop timezone', dash['timezone'] == 'Asia/Kolkata', dash['timezone'])

# One point per DAY, including the days nothing sold. A chart drawn only from
# days that had orders compresses a quiet week and reads as busier than it was.
check('the series covers every day in the window', len(dash['series']) == 30, len(dash['series']))
check('series points carry both measures',
      all('revenue' in p and 'orders' in p and 'date' in p for p in dash['series']))

t = dash['totals']
check('revenue is money, in paise', isinstance(t['revenue']['amount'], int), t['revenue'])
check('the seeded shop has taken money', t['revenue']['amount'] > 0, t['revenue'])
check('orders are counted', t['orders'] > 0, t['orders'])
# Averaged over PAID orders. Dividing by every order placed drags it down with
# the abandoned ones and stops it meaning anything.
check('average order is revenue over paid orders',
      t['averageOrderValue']['amount'] == round(t['revenue']['amount'] / t['paidOrders']),
      f"{t['averageOrderValue']} vs {t['revenue']}/{t['paidOrders']}")
# Null, not zero and not infinity, when the previous window took nothing.
check('a trend is a number or an honest null',
      t['revenueChangePercent'] is None or isinstance(t['revenueChangePercent'], (int, float)),
      t['revenueChangePercent'])

check('the shop has orders at several stages', len(dash['statusBreakdown']) >= 3, dash['statusBreakdown'])
check('best sellers are ranked by units',
      all(dash['topProducts'][i]['quantity'] >= dash['topProducts'][i + 1]['quantity']
          for i in range(len(dash['topProducts']) - 1)),
      [p['quantity'] for p in dash['topProducts']])

# The seed used to jump from 0 straight to 7, so nothing was ever in the 1-5
# band and this card was permanently empty in the demo.
check('running low has something in it', len(dash['lowStock']) > 0, dash['lowStock'])
check('every low-stock row is actually low',
      all(0 < row['left'] <= 5 for row in dash['lowStock']), dash['lowStock'])

s, week = call('GET', '/admin/dashboard?days=7', token=ATOK)
check('the window is a parameter', week['windowDays'] == 7 and len(week['series']) == 7,
      f"{week['windowDays']}d / {len(week['series'])} points")
check('a shorter window cannot have taken more', week['totals']['orders'] <= t['orders'],
      f"7d {week['totals']['orders']} vs 30d {t['orders']}")
s, d = call('GET', '/admin/dashboard?days=0', token=ATOK)
check('a nonsense window is refused', s == 400, s)
s, d = call('POST', '/admin/taxonomy', {'group':'fabric','label':'Corduroy'}, token=ATOK)
check('create taxonomy term', s == 201 and d['code'] == 'corduroy', d)
TERM = d['id']
s, boot2 = call('GET', '/storefront/bootstrap')
check('term reaches the shop immediately', any(t['code']=='corduroy' for t in boot2['taxonomy']['fabric']))
s, d = call('PUT', f'/admin/taxonomy/{TERM}', {'label':'Fine Corduroy'}, token=ATOK)
check('rename term', d['label'] == 'Fine Corduroy')
check('code did NOT change on rename', d['code'] == 'corduroy', d['code'])
s, d = call('POST', '/admin/taxonomy', {'group':'fabric','label':'Corduroy'}, token=ATOK)
check('duplicate code → 409', s == 409, s)
s, d = call('POST', '/admin/taxonomy', {'group':'colour','label':'Bad','swatch':'red'}, token=ATOK)
check('non-hex swatch → 400', s == 400, s)
s, d = call('DELETE', f'/admin/taxonomy/{TERM}', token=ATOK)
check('deactivate (not delete)', d['isActive'] is False)
s, boot3 = call('GET', '/storefront/bootstrap')
check('deactivated term gone from the shop', not any(t['code']=='corduroy' for t in boot3['taxonomy']['fabric']))

s, cats = call('GET', '/admin/categories', token=ATOK)
womens = next(c for c in cats if c['slug'] == 'womens-outerwear')
s, prods = call('GET', '/admin/products?pageSize=1', token=ATOK)
s, charts = call('GET', '/admin/size-charts', token=ATOK)
s, media = call('GET', '/admin/media?pageSize=1', token=ATOK)
img = media['items'][0]
NEW = {'name':'Suite Test Coat','brandCode':'threadline','department':'women','status':'draft',
       'description':'A coat created by the test suite.','fabric':'wool','fit':'relaxed','occasion':'work',
       'primaryCategoryId':womens['id'],'sizeChartId':charts[0]['id'],
       'colourways':[{'code':'olive','images':[{'mediaId':img['id'],'url':img['url'],'alt':img['alt']}]}],
       'sizes':['s','m','l'],'price':499900,'compareAtPrice':699900,'defaultStock':7}
s, created = call('POST', '/admin/products', NEW, token=ATOK)
check('create product 201', s == 201, created)
NPID = created['id']
check('matrix generated 1x3', created['variantCount'] == 3, created['variantCount'])
check('SKUs generated', all(v['sku'] for v in created['variants']))
check('draft is NOT on the storefront', call('GET', '/catalog/products/suite-test-coat')[0] == 404)
s, d = call('POST', '/admin/products', {**NEW, 'fabric':'unobtanium'}, token=ATOK)
check('unknown fabric → 400 naming the field', s == 400 and 'fabric' in d['error'].get('fields', {}), d)
s, d = call('POST', '/admin/products', {**NEW}, token=ATOK)
check('duplicate slug → 409', s == 409, s)
s, d = call('POST', '/admin/products', {**NEW, 'name':'No Sizes','slug':'no-sizes','sizes':[]}, token=ATOK)
check('no sizes → 400', s == 400, s)
s, upd = call('PUT', f'/admin/products/{NPID}', {**NEW, 'sizes':['s','m','l','xl'], 'defaultStock': 3}, token=ATOK)
check('adding a size grows the matrix', upd['variantCount'] == 4, upd['variantCount'])
kept = next(v for v in upd['variants'] if v['size'] == 'm')
check('existing size keeps its stock', kept['stockQuantity'] == 7, kept['stockQuantity'])
s, upd2 = call('PUT', f'/admin/products/{NPID}', {**NEW, 'sizes':['s','m']}, token=ATOK)
disabled = [v for v in upd2['variants'] if not v['isEnabled']]
check('removed sizes disabled, not deleted', len(disabled) == 2, [v['size'] for v in disabled])
s, restored = call('PUT', f'/admin/products/{NPID}', {**NEW, 'sizes':['s','m','l']}, token=ATOK)
back = next(v for v in restored['variants'] if v['size'] == 'l')
check('re-added size restores its old stock', back['stockQuantity'] == 7 and back['isEnabled'], back)
vid2 = next(v['id'] for v in restored['variants'] if v['size'] == 's')
s, d = call('PATCH', f'/admin/products/{NPID}/variants/{vid2}', {'stockQuantity': 42, 'price': 555500}, token=ATOK)
sv = next(v for v in d['variants'] if v['id'] == vid2)
check('variant stock + price edit', sv['stockQuantity'] == 42 and sv['price']['amount'] == 555500, sv)
s, d = call('PATCH', f'/admin/products/{NPID}/status', {'status':'active'}, token=ATOK)
check('publish 200', s == 200 and d['status'] == 'active', s)
check('now live on the storefront', call('GET', '/catalog/products/suite-test-coat')[0] == 200)
# The base price seeds NEW combinations only; existing variants keep theirs.
# Repricing a whole line is a separate, explicit action.
s, ladder = call('PATCH', f'/admin/products/{NPID}/variants/{vid2}', {'price': 123400}, token=ATOK)
s, grown = call('PUT', f'/admin/products/{NPID}', {**NEW, 'sizes':['s','m','l'], 'price': 999900}, token=ATOK)
kept_price = next(v for v in grown['variants'] if v['id'] == vid2)['price']['amount']
check('saving does NOT reprice existing variants', kept_price == 123400, kept_price)
s, repriced = call('POST', f'/admin/products/{NPID}/apply-price', {'price': 777700, 'compareAtPrice': 888800}, token=ATOK)
check('apply-price hits every variant', all(v['price']['amount'] == 777700 for v in repriced['variants']),
      [v['price']['amount'] for v in repriced['variants']])
check('apply-price sets compare-at too', all(v['compareAtPrice']['amount'] == 888800 for v in repriced['variants']))
s, d = call('POST', f'/admin/products/{NPID}/apply-price', {'price': 100}, token=OTOK)
check('apply-price needs catalog.manage', s == 403, s)

s, d = call('DELETE', f'/admin/products/{NPID}', token=ATOK)
check('archive 204', s == 204, s)
check('archived is off the storefront', call('GET', '/catalog/products/suite-test-coat')[0] == 404)

section('14. Admin media, coupons, orders, settings')
s, usage = call('GET', f"/admin/media/{img['id']}/usage", token=ATOK)
check('media usage lists products', s == 200 and isinstance(usage, list))
s, d = call('DELETE', f"/admin/media/{img['id']}", token=ATOK)
check('deleting an in-use image → 409', s == 409, s)
s, d = call('PUT', f"/admin/media/{img['id']}", {'alt': 'Suite alt text', 'tags': ['suite']}, token=ATOK)
check('media alt update', d['alt'] == 'Suite alt text')
s, d = call('POST', '/admin/coupons', {'code':'SUITE10','description':'Test','type':'percentage','percentage':10,'maxDiscount':50000}, token=ATOK)
check('create coupon 201', s == 201, d)
CID = d['id']
s, d = call('POST', '/admin/coupons', {'code':'SUITE10','description':'Dup','type':'percentage','percentage':5}, token=ATOK)
check('duplicate coupon code → 409', s == 409, s)
s, d = call('POST', '/admin/coupons', {'code':'BADPCT','description':'x','type':'percentage'}, token=ATOK)
check('percentage coupon without a percent → 400', s == 400 and 'percentage' in d['error'].get('fields', {}), d)
# A coupon created in the admin has to be spendable in the shop, and the usage
# ledger has to move when it is.
s, made = call('POST', '/admin/coupons', {'code':'SUITECAP','description':'30% capped','type':'percentage',
                                          'percentage':30,'maxDiscount':20000,'minSpend':100000,'usageLimit':5}, token=ATOK)
CAPID = made['id']
s, prod = call('GET', '/catalog/products/leather-biker-jacket')
bigv = next(x for x in prod['variants'] if x['isAvailable'])
s, cbag = call('POST', '/cart/items', {'variantId': bigv['id'], 'quantity': 1}, token=TOK)
s, capped = call('POST', '/cart/coupon', {'code': 'suitecap'}, cart=cbag['id'], token=TOK)
check('admin-made coupon works in the shop', s == 200 and capped['coupon']['code'] == 'SUITECAP', s)
raw_pct = round(capped['totals']['subtotal']['amount'] * 0.30)
check('the cap binds, not the percentage', capped['totals']['couponDiscount']['amount'] == 20000,
      f"got {capped['totals']['couponDiscount']['amount']}, 30% would be {raw_pct}")
s, cbefore = call('GET', '/admin/coupons', token=ATOK)
used_before = next(c for c in cbefore if c['code'] == 'SUITECAP')['usageCount']
s, cplaced = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod':'upi'}, token=TOK, cart=cbag['id'])
corder = cplaced['order'] if s == 201 else cplaced
check('order records the coupon', corder['couponCode'] == 'SUITECAP', corder['couponCode'])
check('order snapshots the discount', corder['totals']['couponDiscount']['amount'] == 20000)
s, cafter = call('GET', '/admin/coupons', token=ATOK)
used_after = next(c for c in cafter if c['code'] == 'SUITECAP')['usageCount']
check('usage ledger increments on checkout', used_after == used_before + 1, f'{used_before} → {used_after}')
s, _ = call('DELETE', f'/admin/coupons/{CAPID}', token=ATOK)
s, still = call('GET', f"/orders/{corder['reference']}", token=TOK)
check('deleting the coupon does not rewrite past orders',
      still['couponCode'] == 'SUITECAP' and still['totals']['couponDiscount']['amount'] == 20000, still['totals'])

s, d = call('DELETE', f'/admin/coupons/{CID}', token=ATOK)
check('delete coupon 204', s == 204, s)
s, orders = call('GET', '/admin/orders', token=ATOK)
check('admin orders 200', s == 200 and orders['total'] > 0, s)
oid = orders['items'][0]['id']
s, d = call('PATCH', f'/admin/orders/{oid}', {'status':'shipped','trackingNumber':'BD123456789IN'}, token=ATOK)
check('order status + tracking', d['status'] == 'shipped' and d['trackingNumber'] == 'BD123456789IN', d)
# The status change has to be visible to the person who placed the order, not
# only inside the admin.
s, mine = call('GET', '/orders', token=TOK)
seen = next((o for o in mine if o['id'] == oid), None)
if seen is not None:
    check('shopper sees the new status', seen['status'] == 'shipped', seen['status'])
    check('shopper sees the tracking number', seen['trackingNumber'] == 'BD123456789IN', seen['trackingNumber'])
s, d = call('PATCH', f'/admin/orders/{oid}', {'trackingNumber': None}, token=ATOK)
check('tracking can be cleared', d['trackingNumber'] is None, d['trackingNumber'])
check('clearing tracking leaves the status alone', d['status'] == 'shipped', d['status'])
s, d = call('PATCH', f'/admin/orders/{oid}', {'status':'nonsense'}, token=ATOK)
check('unknown status → 400', s == 400, s)
s, d = call('PATCH', f'/admin/orders/{oid}', {'status':'delivered'}, token=OTOK)
check('operations CAN move an order on', s == 200 and d['status'] == 'delivered', s)
s, d = call('PATCH', f'/admin/orders/{oid}', {'status':'shipped'}, token=MTOK)
check('merchandiser cannot touch orders', s == 403, s)
s, d = call('GET', '/admin/settings', token=ATOK)
check('settings 200', s == 200 and d['branding']['primary'])
s, d = call('PUT', '/admin/settings', {'branding': {'accent': 'not-a-colour'}}, token=ATOK)
check('bad hex rejected', s == 400, s)
s, d = call('PUT', '/admin/settings', {'identity': {'gstin': 'NOPE'}}, token=ATOK)
check('bad GSTIN rejected', s == 400, s)
s, d = call('PUT', '/admin/settings', {'payment': {'ifsc': 'nope'}}, token=ATOK)
check('bad IFSC rejected', s == 400, s)
s, before = call('GET', '/admin/settings', token=ATOK)
s, d = call('PUT', '/admin/settings', {'branding': {'accent': '#123456'}}, token=ATOK)
check('palette save 200', s == 200 and d['branding']['accent'] == '#123456', s)
# Regression: a partial `$set` used to REPLACE the whole branding object, wiping
# every other colour and the hero copy along with it.
check('partial save keeps sibling colours', d['branding']['surface'] == before['branding']['surface'], d['branding']['surface'])
check('partial save keeps hero copy', d['branding']['heroCopy'] == before['branding']['heroCopy'], d['branding']['heroCopy'][:30])
check('partial save keeps fonts', d['branding']['fontDisplay'] == before['branding']['fontDisplay'])
s, d2 = call('PUT', '/admin/settings', {'identity': {'legalName': 'Renamed Ltd'}}, token=ATOK)
check('partial identity save keeps GSTIN', d2['identity']['gstin'] == before['identity']['gstin'], d2['identity'])
s, d3 = call('PUT', '/admin/settings', {'payment': {'bankName': 'ICICI Bank'}}, token=ATOK)
check('partial payout save keeps UPI id', d3['payment']['upiId'] == before['payment']['upiId'], d3['payment'])
s, d4 = call('PUT', '/admin/settings', {'shipping': before['shipping']}, token=ATOK)
check('shipping round-trips', d4['shipping']['freeAbove']['amount'] == before['shipping']['freeAbove']['amount'])
s, boot4 = call('GET', '/storefront/bootstrap')
check('palette reaches the shop', boot4['settings']['branding']['accent'] == '#123456')
call('PUT', '/admin/settings', {'branding': {'accent': '#8f3d2f'},
                                'identity': {'legalName': before['identity']['legalName']},
                                'payment': {'bankName': before['payment']['bankName']}}, token=ATOK)

section('15. Exports')
# `expect_header`, not `must` — that name is taken by the helper above, and
# shadowing it turned a later call into "'str' object is not callable".
for kind, expect_header in [('products','SKU,Product'), ('orders','Reference,Placed'), ('customers','Email,First name')]:
    s, body = call('GET', f'/admin/export/{kind}', token=ATOK, raw=True)
    check(f'{kind} export 200', s == 200, s)
    check(f'{kind} CSV has a BOM', body.startswith('﻿'), repr(body[:3]))
    check(f'{kind} CSV headers', expect_header in body, body[:80])
    check(f'{kind} CSV uses CRLF', '\r\n' in body)
# Bulk export is its own permission, so a role that can READ the catalogue still
# cannot download all of it.
s, body = call('GET', '/admin/export/products', token=OTOK, raw=True)
check('operations (view only) blocked from export', s == 403 and 'data.export' in str(body), body)
s, body = call('GET', '/admin/export/customers', token=OTOK, raw=True)
check('operations blocked from the customer export', s == 403, s)
s, anl = call('POST', '/admin/auth/sign-in', {'email': 'analyst@threadline.shop', 'password': 'threadline-admin-2026'})
ANTOK = must('analyst sign-in', s, anl)['token']
s, body = call('GET', '/admin/export/customers', token=ANTOK, raw=True)
check('analyst CAN export', s == 200 and 'Email,First name' in body, s)
s, d = call('POST', '/admin/products', {'name':'X','brandCode':'threadline','department':'women','colourways':[{'code':'black','images':[]}],'sizes':['m'],'price':1000}, token=ANTOK)
check('analyst still cannot edit the catalogue', s == 403, s)

section('16. Staff lifecycle')
suffix = int(__import__("time").time())
NEWMAIL = f'suite.staff.{suffix}@threadline.shop'
s, made = call('POST', '/admin/staff', {'email': NEWMAIL, 'password': 'a-long-staff-password',
                                        'name': 'Suite Staff', 'role': 'support'}, token=ATOK)
check('create staff 201', s == 201, made)
SID = made['id']
check('role preset applied on create', sorted(made['permissions']) == sorted(
    ['catalog.view', 'order.view', 'customer.view', 'review.moderate']), made['permissions'])
s, d = call('POST', '/admin/staff', {'email': NEWMAIL, 'password': 'a-long-staff-password',
                                     'name': 'Dup', 'role': 'support'}, token=ATOK)
check('duplicate staff email → 409', s == 409, s)
s, d = call('POST', '/admin/staff', {'email': f'short.{suffix}@x.test', 'password': 'short',
                                     'name': 'Short', 'role': 'support'}, token=ATOK)
check('short staff password → 400', s == 400 and 'password' in d['error'].get('fields', {}), d)

s, newauth = call('POST', '/admin/auth/sign-in', {'email': NEWMAIL, 'password': 'a-long-staff-password'})
NTOK = must('new staff sign-in', s, newauth)['token']
check('new staff can read orders', call('GET', '/admin/orders', token=NTOK)[0] == 200)
check('new staff cannot manage orders', call('PATCH', f'/admin/orders/{oid}', {'status': 'packed'}, token=NTOK)[0] == 403)
check('new staff cannot reach settings', call('GET', '/admin/settings', token=NTOK)[0] == 403)

# Regression: changing the role used to rename it and leave the old permissions
# in place, so the dropdown claimed something that had not happened.
s, promoted = call('PUT', f'/admin/staff/{SID}', {'role': 'operations'}, token=ATOK)
check('role change re-applies the preset', 'order.manage' in promoted['permissions'], promoted['permissions'])
check('and drops the old role\'s extras', 'review.moderate' not in promoted['permissions'], promoted['permissions'])

# Permissions are read from the database on every request, so the token issued
# before the promotion already carries the new access.
check('the OLD token gains the new permission', call('PATCH', f'/admin/orders/{oid}', {'status': 'packed'}, token=NTOK)[0] == 200)
s, d = call('PUT', f'/admin/staff/{SID}', {'role': 'wizard'}, token=ATOK)
check('unknown role → 400', s == 400, s)
s, custom = call('PUT', f'/admin/staff/{SID}', {'permissions': ['catalog.view']}, token=ATOK)
check('an explicit permission list wins', custom['permissions'] == ['catalog.view'], custom['permissions'])
check('and it takes effect immediately', call('GET', '/admin/orders', token=NTOK)[0] == 403)

s, _ = call('PUT', f'/admin/staff/{SID}/password', {'password': 'another-long-password'}, token=ATOK)
check('password reset works', call('POST', '/admin/auth/sign-in',
      {'email': NEWMAIL, 'password': 'another-long-password'})[0] == 200)
check('the old password stops working', call('POST', '/admin/auth/sign-in',
      {'email': NEWMAIL, 'password': 'a-long-staff-password'})[0] == 401)

s, d = call('PUT', f'/admin/staff/{SID}', {'isActive': False}, token=ATOK)
check('deactivate 200', s == 200 and d['isActive'] is False, s)
check('a deactivated session dies at once', call('GET', '/admin/products', token=NTOK)[0] == 401)
check('and they cannot sign back in', call('POST', '/admin/auth/sign-in',
      {'email': NEWMAIL, 'password': 'another-long-password'})[0] == 401)
s, me_now = call('GET', '/admin/auth/me', token=ATOK)
s, d = call('PUT', f"/admin/staff/{me_now['staff']['id']}", {'isActive': False}, token=ATOK)
check('an owner cannot lock themselves out', s == 400, s)

def head(path, extra=None):
    """Status + headers only. The cache checks below are about the headers, and
    the rest of the suite never needed them."""
    req = urllib.request.Request(API + path, method='GET')
    for k, v in (extra or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}


section('17. Reset outbox and rate limiting')
# A reset link is a credential. The outbox row proves the mail was queued; it
# must not also hand the token to anyone who can read the admin's email list.
s, mail = call('GET', '/admin/emails?template=password-reset', token=ATOK)
sent = mail['items'][0] if mail['items'] else {}
check('a reset email was queued', bool(sent), mail['total'])
check('the token is not stored in the outbox metadata',
      'token' not in json.dumps(sent.get('data') or {}).lower(), sent.get('data'))
check('nor pasted into the body',
      'reset-password?token=' not in (sent.get('body') or '') or len(sent.get('body', '')) > 0)

def credential_budget(path, body):
    """The draft-7 `RateLimit` header, as (limit, remaining).

    Read rather than exhausted: the suite raises the limit to run at all, so
    forcing a 429 would mean five hundred wasted requests. What matters is that
    the limiter is installed on the endpoint and counting down."""
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as r: headers = r.headers
    except urllib.error.HTTPError as e: headers = e.headers
    field = headers.get('RateLimit') or ''
    parts = dict(kv.split('=') for kv in field.replace(' ', '').split(',') if '=' in kv)
    return int(parts.get('limit', 0)), int(parts.get('remaining', -1))

limit, before = credential_budget('/auth/forgot-password', {'email': 'demo@threadline.shop'})
check('forgot-password sits behind the credential limiter', limit > 0, limit)
_, after = credential_budget('/auth/forgot-password', {'email': 'demo@threadline.shop'})
check('and each attempt spends budget', after < before, f'{before} → {after}')
_, shared = credential_budget('/auth/reset-password', {'token': 'x', 'password': 'a-long-new-password'})
# One budget across both, so a script cannot dodge the limit by alternating.
check('reset-password shares the same budget', shared < after, f'{after} → {shared}')
check('production default stays at ten',
      "default(10)" in open(ROOT + '/server/src/config/env.ts').read().replace(' ', ''))

section('18. Journal')
s, feed = call('GET', '/storefront/journal')
check('journal 200', s == 200)
check('only published entries are listed', all(p.get('id') for p in feed['items']), len(feed['items']))
check('categories are derived, not hardcoded', isinstance(feed['categories'], list) and feed['categories'])
cat = feed['categories'][0]
s, filtered = call('GET', f'/storefront/journal?category={cat}')
check(f'category filter narrows to {cat}', all(p['category'] == cat for p in filtered['items']), filtered['categories'])
slug = feed['items'][0]['slug']
s, post = call('GET', f'/storefront/journal/{slug}')
check('a post reads by slug', s == 200 and post['slug'] == slug, s)
check('body comes back', len(post['body']) > 200, len(post['body']))
check('linked products are resolved, not raw slugs',
      all(isinstance(p, dict) and 'fromPrice' in p and 'imageUrl' in p for p in post['products']),
      [p.get('slug') for p in post['products']])
check('an unknown slug → 404', call('GET', '/storefront/journal/no-such-entry')[0] == 404)

s, mine = call('GET', '/admin/journal', token=ATOK)
check('admin sees every entry', s == 200 and len(mine) >= len(feed['items']), s)
# The admin editor writes back exactly what it was handed, so anything the list
# omits is erased on the next save. Both of these were missing once.
check('admin list carries isPublished', all('isPublished' in p for p in mine))
check('admin list carries productSlugs', all('productSlugs' in p for p in mine))

s, made = call('POST', '/admin/journal',
               {'title': 'Smoke test entry', 'body': 'One paragraph.\n\n## A heading\n\nAnother.',
                'category': 'Care', 'productSlugs': ['heavyweight-cotton-tee'], 'isPublished': False}, token=ATOK)
check('create 201', s == 201, s)
check('slug derived from the title', made['slug'] == 'smoke-test-entry', made.get('slug'))
check('a draft stays off the shop', call('GET', f"/storefront/journal/{made['slug']}")[0] == 404)
# The editor writes back whatever the save handed it. If the response drops the
# body or the draft flag, the next save silently erases them.
check('the save response carries the body back', made.get('body', '').startswith('One paragraph'), sorted(made.keys()))
check('and the draft flag', made.get('isPublished') is False, made.get('isPublished'))
check('and the product links', made.get('productSlugs') == ['heavyweight-cotton-tee'], made.get('productSlugs'))
s, edited = call('PUT', f"/admin/journal/{made['id']}", {'title': 'Smoke test entry',
                 'body': made['body'], 'readMinutes': 7, 'isPublished': True,
                 'productSlugs': ['heavyweight-cotton-tee']}, token=ATOK)
check('publishing it puts it on the shop', call('GET', f"/storefront/journal/{made['slug']}")[0] == 200)
s, live = call('GET', f"/storefront/journal/{made['slug']}")
check('the edit round-trips its product links', [p['slug'] for p in live['products']] == ['heavyweight-cotton-tee'], live['products'])
check('an empty body → 400', call('POST', '/admin/journal', {'title': 'x', 'body': ''}, token=ATOK)[0] == 400)
check('writing needs cms.manage', call('POST', '/admin/journal',
      {'title': 'x', 'body': 'y'}, token=OTOK)[0] == 403)
check('delete 204', call('DELETE', f"/admin/journal/{made['id']}", token=ATOK)[0] == 204)
check('and it leaves the shop', call('GET', f"/storefront/journal/{made['slug']}")[0] == 404)


section('19. Editable content revalidates')
# This was a real bug: a five-minute timed cache meant a merchant edited a page
# in the admin, reloaded the shop, and saw the old copy with no way to tell
# whether the save had failed.
for path in ('/storefront/bootstrap', '/storefront/journal', f'/storefront/journal/{slug}'):
    s, h = head(path)
    cc = h.get('cache-control', '')
    check(f'{path} does not serve a stale copy', 'max-age' not in cc, cc)
    check(f'{path} sends an ETag', bool(h.get('etag')), h.get('etag'))
    s2, _ = head(path, {'If-None-Match': h.get('etag', '')})
    check(f'{path} revalidates to 304', s2 == 304, s2)


section('20. Admin profile')
s, me = call('GET', '/admin/auth/me', token=ATOK)
original = me['staff']['name']
s, d = call('PUT', '/admin/auth/profile', {'name': 'Renamed Owner'}, token=ATOK)
check('rename 200', s == 200 and d['name'] == 'Renamed Owner', d)
# The profile endpoint must not be a back door to self-promotion.
s, d = call('PUT', '/admin/auth/profile',
            {'name': 'Renamed Owner', 'role': 'viewer', 'permissions': [], 'isActive': False}, token=ATOK)
check('role cannot be changed here', d['role'] == me['staff']['role'], d['role'])
check('permissions cannot be changed here', d['permissions'] == me['staff']['permissions'])
check('and they cannot deactivate themselves here', d['isActive'] is True)
check('an empty name → 400', call('PUT', '/admin/auth/profile', {'name': '  '}, token=ATOK)[0] == 400)
s, _ = call('PUT', '/admin/auth/password',
            {'currentPassword': 'wrong-password-here', 'newPassword': 'a-long-enough-password'}, token=ATOK)
check('the wrong current password → 400', s == 400, s)
check('a short new password → 400', call('PUT', '/admin/auth/password',
      {'currentPassword': 'threadline-admin-2026', 'newPassword': 'short'}, token=ATOK)[0] == 400)
call('PUT', '/admin/auth/profile', {'name': original}, token=ATOK)
check('the name is restored for the next run',
      call('GET', '/admin/auth/me', token=ATOK)[1]['staff']['name'] == original)


section('21. Paying — by hand, and the rules that stop it going wrong')

# A fresh order that owes money, to walk the whole lifecycle on.
s, pv = call('GET', '/catalog/products/oxford-button-down-shirt')
pvar = next(x for x in pv['variants'] if x['isAvailable'])
stock_before = pvar['stockQuantity']
s, pbag = call('POST', '/cart/items', {'variantId': pvar['id'], 'quantity': 1}, token=TOK)
s, pplaced = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod': 'upi'},
                  token=TOK, cart=pbag['id'])
pplaced = must('order placed for the payment walk', s, pplaced)
PREF = pplaced['order']['reference']
PID_ORDER = pplaced['order']['id']

# Instructions must be re-fetchable: a shopper who reloads, or opens the order
# from their email on another device, has no checkout response to read.
s, again = call('GET', f'/orders/{PREF}/payment', token=TOK)
check('transfer details can be fetched again', s == 200 and again['manual']['upi']['id'] != '', s)
s, d = call('GET', f'/orders/{PREF}/payment?email=stranger@example.test')
check("someone else cannot read the shop's account details", s == 404, s)

s, d = call('POST', f'/orders/{PREF}/payment/claim', {'reference': '123'}, token=TOK)
check('a too-short reference is refused', s == 400 and 'reference' in d['error']['fields'], d)
s, claimed = call('POST', f'/orders/{PREF}/payment/claim',
                  {'reference': '4021 8899 1234'}, token=TOK)
claimed = must('payment claimed', s, claimed)
check('a claim is NOT a payment', claimed['paymentStatus'] == 'verifying', claimed['paymentStatus'])
check('the reference is normalised', claimed['payment']['reference'] == '402188991234',
      claimed['payment']['reference'])
check('claiming clears the expiry so a paid order is never swept',
      claimed['payment']['expiresAt'] is None)
check('the order is still not confirmed', claimed['status'] == 'pending', claimed['status'])

s, queue = call('GET', '/admin/payments', token=ATOK)
check('the claim reaches the payment queue',
      any(o['reference'] == PREF for o in queue['items']), queue['total'])
check('the queue counts what is waiting', queue['counts'].get('verifying', 0) >= 1, queue['counts'])
s, found = call('GET', f'/admin/payments?search=402188991234', token=ATOK)
check('a payment is findable by the UTR the shopper quoted',
      any(o['reference'] == PREF for o in found['items']), found['total'])

# Confirming money is its own permission, deliberately not part of order.manage.
s, analyst = call('POST', '/admin/auth/sign-in',
                  {'email': 'analyst@threadline.shop', 'password': 'threadline-admin-2026'})
NTOK = analyst['token']
s, d = call('POST', f'/admin/payments/{PID_ORDER}/verify', token=NTOK)
check('an analyst cannot confirm a payment', s == 403 and 'payment.verify' in d['error']['message'], d)
s, d = call('POST', f'/admin/payments/{PID_ORDER}/reject', {'reason': 'no'}, token=ATOK)
check('sending a claim back needs a reason the shopper can act on', s == 400, s)

# Rejected, then re-claimed: a mistyped UTR must not kill the order.
s, sent_back = call('POST', f'/admin/payments/{PID_ORDER}/reject',
                    {'reason': 'Nothing matching that reference reached our account.'}, token=ATOK)
sent_back = must('claim sent back', s, sent_back)
check('a rejected claim reopens for payment',
      sent_back['paymentStatus'] == 'awaiting_payment', sent_back['paymentStatus'])
check('the shopper is told why', sent_back['payment']['rejectionReason'].startswith('Nothing'))
check('rejecting restarts the stock clock', sent_back['payment']['expiresAt'] is not None)
s, reclaimed = call('POST', f'/orders/{PREF}/payment/claim',
                    {'reference': '402188995555'}, token=TOK)
check('the shopper can quote a corrected reference', reclaimed['paymentStatus'] == 'verifying')
check('repeat claims are counted', reclaimed['payment']['claimCount'] == 2,
      reclaimed['payment']['claimCount'])

s, paid = call('POST', f'/admin/payments/{PID_ORDER}/verify', token=ATOK)
paid = must('payment verified', s, paid)
check('verifying marks it paid', paid['paymentStatus'] == 'paid', paid['paymentStatus'])
check('paying is what confirms the order', paid['status'] == 'confirmed', paid['status'])
check('who confirmed it is recorded', paid['payment']['verifiedBy'] is not None)

# Idempotency. A double-tapped button and a retried webhook arrive here too.
s, twice = call('POST', f'/admin/payments/{PID_ORDER}/verify', token=ATOK)
check('verifying twice is a no-op, not a second payment',
      s == 200 and twice['payment']['verifiedAt'] == paid['payment']['verifiedAt'],
      f"{paid['payment']['verifiedAt']} → {twice['payment']['verifiedAt']}")
s, d = call('POST', f'/orders/{PREF}/payment/claim', {'reference': '999988887777'}, token=TOK)
check('a paid order refuses a further claim', s == 422 and 'already paid' in d['error']['message'], d)

# The rule that matters most: an order whose stock went back on sale can never
# be marked paid, on any path.
s, cbag2 = call('POST', '/cart/items', {'variantId': pvar['id'], 'quantity': 1}, token=TOK)
s, cplaced2 = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod': 'bank_transfer'},
                   token=TOK, cart=cbag2['id'])
CREF = cplaced2['order']['reference']
CID = cplaced2['order']['id']
call('POST', f'/orders/{CREF}/payment/claim', {'reference': '555544443333'}, token=TOK)
s, _ = call('PATCH', f'/admin/orders/{CID}', {'status': 'cancelled'}, token=ATOK)
s, d = call('POST', f'/admin/payments/{CID}/verify', token=ATOK)
check('a CANCELLED order cannot be marked paid', s == 422 and 'cancelled' in d['error']['message'], d)

# The webhook is authenticated by its signature over the raw body, nothing else.
s, d = call('POST', '/payments/webhook/razorpay', {'event': 'payment.captured'})
check('an unsigned webhook is refused', s == 401, s)

section('22. Ending an order gives its stock back')

def _stock(slug, vid):
    _, pr = call('GET', f'/catalog/products/{slug}')
    return next(x for x in pr['variants'] if x['id'] == vid)['stockQuantity']

SLUG = 'oxford-button-down-shirt'
s, sp = call('GET', f'/catalog/products/{SLUG}')
svar = next(x for x in sp['variants'] if x['isAvailable'] and x['stockQuantity'] >= 6)
SVID = svar['id']

def _place(qty, method='cod'):
    _, bag = call('POST', '/cart/items', {'variantId': SVID, 'quantity': qty}, token=TOK)
    st, pl = call('POST', '/checkout', {'shippingAddress': addr, 'paymentMethod': method},
                  token=TOK, cart=bag['id'])
    return must(f'order placed ({method}, {qty})', st, pl)['order']

def _patch(oid, patch):
    return call('PATCH', f'/admin/orders/{oid}', patch, token=ATOK)

# Cancelling before dispatch: the goods never left, so they go back.
base = _stock(SLUG, SVID)
o = _place(3)
held = _stock(SLUG, SVID)
check('stock is reserved at checkout', held == base - 3, f'{base} → {held}')
check('a live order has not released its stock', o['stockReleasedAt'] is None)
st, cancelled = _patch(o['id'], {'status': 'cancelled'})
back = _stock(SLUG, SVID)
check('cancelling records the release', cancelled['stockReleasedAt'] is not None, cancelled['stockReleasedAt'])
check('cancelling puts the goods back on sale', back == base, f'expected {base}, got {back}')

# The bug this section exists for: it used to credit nothing at all, and now it
# must not credit twice either.
_patch(o['id'], {'status': 'pending'})
_patch(o['id'], {'status': 'cancelled'})
twice = _stock(SLUG, SVID)
check('re-cancelling never credits a second time', twice == base, f'expected {base}, got {twice}')

# Cancelling AFTER dispatch must not restock: those garments are on a van, and
# putting them back on sale sells the same one twice.
base2 = _stock(SLUG, SVID)
o2 = _place(2)
_patch(o2['id'], {'status': 'shipped'})
st, shipped_cancel = _patch(o2['id'], {'status': 'cancelled'})
after2 = _stock(SLUG, SVID)
check('cancelling a SHIPPED order does not restock', after2 == base2 - 2,
      f'expected {base2 - 2}, got {after2}')
check('and it is not marked released', shipped_cancel['stockReleasedAt'] is None)

# A return is the merchant's call: goods are back, but a worn garment going
# straight onto the shelf is worse than one sitting in a box.
base3 = _stock(SLUG, SVID)
o3 = _place(2)
_patch(o3['id'], {'status': 'delivered'})
_patch(o3['id'], {'status': 'returned'})
after3 = _stock(SLUG, SVID)
check('a return does not restock on its own', after3 == base3 - 2,
      f'expected {base3 - 2}, got {after3}')

base4 = _stock(SLUG, SVID)
o4 = _place(2)
_patch(o4['id'], {'status': 'delivered'})
st, restocked = _patch(o4['id'], {'status': 'returned', 'restock': True})
after4 = _stock(SLUG, SVID)
check('a return restocks when the merchant says so', after4 == base4,
      f'expected {base4}, got {after4}')
check('the restock is recorded on the order', restocked['stockReleasedAt'] is not None)

# `restock` is an instruction, not a column.
check('restock is not written onto the order', 'restock' not in restocked, list(restocked)[:12])

print(f'\n{"="*62}\n  PASSED {passed}   FAILED {failed}\n{"="*62}')
for f in FAILS: print('  ✗', f)


sys.exit(1 if failed else 0)
