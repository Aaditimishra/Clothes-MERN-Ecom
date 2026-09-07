import { Router } from 'express';
import { z } from 'zod';
import { PAYMENT_METHODS } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { asyncHandler } from '../../lib/async-handler';
import { customerIdOf } from '../../lib/current-customer';
import { cartKeyFrom } from '../../lib/cart-key';
import { parseBody, parseQuery } from '../../lib/validate';
import { requireCustomer } from '../../middleware/authenticate';
import { CustomerModel } from '../../models/customer.model';
import { addressSchema } from '../auth/auth.schemas';
import { findOrder, listOrders, placeOrder } from './order.service';

const checkoutSchema = z.object({
  shippingAddress: addressSchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
});

export const orderRouter: Router = Router();

/**
 * Checkout works for guests, so the email is resolved from whichever source
 * exists: the signed-in account first, the form field otherwise. An order with
 * no email cannot send a confirmation or be looked up later, so it is refused.
 */
const resolveEmail = async (
  customerId: string | null,
  provided: string | undefined,
): Promise<string> => {
  if (customerId) {
    const customer = await CustomerModel.findById(customerId).select('email').lean();
    if (customer) return customer.email;
  }
  if (provided) return provided;
  throw ApiError.badRequest('We need an email to send your confirmation to', {
    email: 'Enter your email address',
  });
};

orderRouter.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, checkoutSchema);
    const key = cartKeyFrom(req);

    res.status(201).json(
      await placeOrder({
        key,
        shippingAddress: body.shippingAddress,
        paymentMethod: body.paymentMethod,
        email: await resolveEmail(key.customerId, body.email),
      }),
    );
  }),
);

orderRouter.get(
  '/orders',
  requireCustomer,
  asyncHandler(async (req, res) => {
    res.json(await listOrders(customerIdOf(req)));
  }),
);

/**
 * Guests reach their confirmation with the reference plus the email they used.
 * Signed-in shoppers need neither — ownership is proven by the token.
 */
orderRouter.get(
  '/orders/:reference',
  asyncHandler(async (req, res) => {
    const reference = z.string().trim().min(1).max(20).parse(req.params.reference);
    const { email } = parseQuery(
      req,
      z.object({ email: z.string().trim().toLowerCase().email().optional() }),
    );

    res.json(
      await findOrder(reference, {
        customerId: req.customerId ?? null,
        email: email ?? null,
      }),
    );
  }),
);
