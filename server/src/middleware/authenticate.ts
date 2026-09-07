import type { RequestHandler } from 'express';

import { ApiError } from '../lib/api-error';
import { readToken } from '../modules/auth/auth.tokens';

const bearerFrom = (header: string | undefined): string | null => {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};

/**
 * Reads the token if one is present, and does nothing if it is not.
 *
 * Most of this shop works for guests. Browsing, the bag and checkout all behave
 * differently when signed in but must never require it, so the default is to
 * attach an identity when there is one rather than to demand one.
 */
export const attachCustomer: RequestHandler = (req, _res, next) => {
  const token = bearerFrom(req.headers.authorization);
  const customerId = token ? readToken(token) : null;
  if (customerId) req.customerId = customerId;
  next();
};

/** For the handful of routes that genuinely need an account. */
export const requireCustomer: RequestHandler = (req, _res, next) => {
  if (!req.customerId) {
    next(ApiError.unauthorized());
    return;
  }
  next();
};
