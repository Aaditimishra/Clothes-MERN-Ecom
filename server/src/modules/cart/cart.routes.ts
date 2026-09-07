import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler';
import { cartKeyFrom } from '../../lib/cart-key';
import { parseBody } from '../../lib/validate';
import {
  addItem,
  applyCoupon,
  getCart,
  MAX_QUANTITY_PER_LINE,
  removeCoupon,
  removeItem,
  setQuantity,
} from './cart.service';

const quantitySchema = z.coerce.number().int().min(0).max(MAX_QUANTITY_PER_LINE);
const variantIdSchema = z.string().trim().min(1).max(64);

export const cartRouter: Router = Router();

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getCart(cartKeyFrom(req)));
  }),
);

cartRouter.post(
  '/items',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({
        variantId: variantIdSchema,
        quantity: quantitySchema.min(1).default(1),
      }),
    );
    res.json(await addItem(cartKeyFrom(req), body.variantId, body.quantity));
  }),
);

cartRouter.patch(
  '/items/:variantId',
  asyncHandler(async (req, res) => {
    const { quantity } = parseBody(req, z.object({ quantity: quantitySchema }));
    const variantId = variantIdSchema.parse(req.params.variantId);
    res.json(await setQuantity(cartKeyFrom(req), variantId, quantity));
  }),
);

cartRouter.delete(
  '/items/:variantId',
  asyncHandler(async (req, res) => {
    const variantId = variantIdSchema.parse(req.params.variantId);
    res.json(await removeItem(cartKeyFrom(req), variantId));
  }),
);

cartRouter.post(
  '/coupon',
  asyncHandler(async (req, res) => {
    const { code } = parseBody(
      req,
      z.object({ code: z.string().trim().min(1, 'Enter a code').max(40) }),
    );
    res.json(await applyCoupon(cartKeyFrom(req), code));
  }),
);

cartRouter.delete(
  '/coupon',
  asyncHandler(async (req, res) => {
    res.json(await removeCoupon(cartKeyFrom(req)));
  }),
);
