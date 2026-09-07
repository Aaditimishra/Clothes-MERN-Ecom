import { CART_ID_HEADER } from '@shop/shared';
import type { Request } from 'express';

import type { CartKey } from '../modules/cart/cart.service';

/**
 * Identifies whose bag a request is talking about.
 *
 * The bag id travels in a header, not a cookie. A cookie would ride along on
 * every request to every path, and would need SameSite and CORS handling the
 * moment the storefront is served from a different origin than the API. A header
 * is explicit: the client sends it when it means to.
 *
 * The id is opaque and grants nothing on its own — it addresses a bag, it does
 * not authorise anything. A signed-in shopper's id takes precedence, so their
 * bag follows them between devices.
 */
export const cartKeyFrom = (req: Request): CartKey => {
  const header = req.headers[CART_ID_HEADER];
  return {
    cartId: typeof header === 'string' && header.length > 0 ? header : null,
    customerId: req.customerId ?? null,
  };
};
