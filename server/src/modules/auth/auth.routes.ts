import { Router } from 'express';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../../config/env';
import { asyncHandler } from '../../lib/async-handler';
import { customerIdOf } from '../../lib/current-customer';
import { cartKeyFrom } from '../../lib/cart-key';
import { parseBody } from '../../lib/validate';
import { requireCustomer } from '../../middleware/authenticate';
import { passwordSchema, signInSchema, signUpSchema } from './auth.schemas';
import { mergeGuestCart } from '../cart/cart.service';
import { onCustomerRegistered } from '../notification/notification.service';
import { getCustomer, signIn, signUp } from './auth.service';
import { completePasswordReset, requestPasswordReset } from './reset.service';
import { z } from 'zod';

/**
 * Credential endpoints get their own, much tighter limit.
 *
 * The global limiter is sized for browsing, where a shopper legitimately makes
 * hundreds of requests. Ten sign-in attempts in fifteen minutes is generous for
 * a person who has forgotten their password and useless for a script working
 * through a password list.
 */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.CREDENTIAL_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'too_many_requests', message: 'Too many attempts. Try again shortly.' },
  },
});

/**
 * Carries a guest bag into the account the shopper just authenticated as.
 *
 * Runs after the credentials are accepted, and never fails the request: a
 * shopper who has just signed in correctly must not be shown an error because
 * their old bag could not be merged. The bag is worth saving, not worth blocking
 * a sign-in for.
 */
const adoptGuestCart = async (req: Request, customerId: string): Promise<void> => {
  const { cartId } = cartKeyFrom(req);
  if (!cartId) return;

  try {
    await mergeGuestCart(cartId, customerId);
  } catch (error) {
    console.error('[auth] could not merge guest bag', error);
  }
};

export const authRouter: Router = Router();

authRouter.post(
  '/sign-up',
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const result = await signUp(parseBody(req, signUpSchema));
    await adoptGuestCart(req, result.customer.id);

    // Fire-and-forget: a welcome email must never be the reason a sign-up fails.
    void onCustomerRegistered({
      id: result.customer.id,
      email: result.customer.email,
      firstName: result.customer.firstName,
    });

    res.status(201).json(result);
  }),
);

authRouter.post(
  '/sign-in',
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const result = await signIn(parseBody(req, signInSchema));
    await adoptGuestCart(req, result.customer.id);
    res.json(result);
  }),
);

authRouter.get(
  '/me',
  requireCustomer,
  asyncHandler(async (req, res) => {
    res.json(await getCustomer(customerIdOf(req)));
  }),
);

/* ---------------------------- password reset ----------------------------- */

/**
 * Where the reset link points.
 *
 * Built from the request's own origin rather than a configured base URL, so the
 * link works whether the shop is on localhost, a preview deploy or production —
 * and cannot be pointed elsewhere, because only origins the API already accepts
 * via CORS can reach this route.
 */
const resetLinkBase = (req: Request, path: string): string => {
  const origin = req.headers.origin;
  const allowed = typeof origin === 'string' && env.corsOrigins.includes(origin);
  return `${allowed ? origin : env.corsOrigins[0] ?? ''}${path}`;
};

authRouter.post(
  '/forgot-password',
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parseBody(
      req,
      z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') }),
    );

    await requestPasswordReset('customer', email, resetLinkBase(req, '/reset-password'));

    // Always 202, whether or not the address is registered.
    res.status(202).json({ message: 'If that email has an account, a reset link is on its way.' });
  }),
);

authRouter.post(
  '/reset-password',
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({ token: z.string().trim().min(1, 'The link is missing its token'), password: passwordSchema }),
    );

    await completePasswordReset('customer', body.token, body.password);
    res.status(204).end();
  }),
);
