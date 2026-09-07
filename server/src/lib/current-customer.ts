import type { Request } from 'express';

import { ApiError } from './api-error';

/**
 * The signed-in customer's id, as a plain `string`.
 *
 * Routes behind `requireCustomer` know an identity is present, but the type says
 * `string | undefined` — so every handler would otherwise reach for `!`. This
 * narrows it once, and the throw is a real backstop: if a route is ever mounted
 * without the middleware, it returns 401 instead of querying for customer
 * `undefined` and quietly returning someone else's data.
 */
export const customerIdOf = (req: Request): string => {
  if (!req.customerId) throw ApiError.unauthorized();
  return req.customerId;
};
