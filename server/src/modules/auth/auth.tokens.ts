import jwt from 'jsonwebtoken';

import { env } from '../../config/env';

interface TokenPayload {
  sub: string;
}

export const issueToken = (customerId: string): string =>
  jwt.sign({ sub: customerId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

/**
 * Returns the customer id, or `null` for anything that is not a valid token.
 *
 * Expiry, a bad signature and malformed rubbish are deliberately not
 * distinguished: telling a caller which one it was helps an attacker narrow
 * down what they have, and helps a legitimate shopper not at all — they sign in
 * again either way.
 */
export const readToken = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return typeof payload === 'object' && typeof payload.sub === 'string'
      ? payload.sub
      : null;
  } catch {
    return null;
  }
};
