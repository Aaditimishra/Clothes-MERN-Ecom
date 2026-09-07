import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler';
import { customerIdOf } from '../../lib/current-customer';
import { parseBody } from '../../lib/validate';
import { requireCustomer } from '../../middleware/authenticate';
import { savedAddressSchema } from '../auth/auth.schemas';
import { passwordSchema } from '../auth/auth.schemas';
import {
  addAddress,
  addPaymentMethod,
  changePassword,
  getWishlist,
  listPaymentMethods,
  removeAddress,
  removePaymentMethod,
  setDefaultPaymentMethod,
  toggleWishlist,
  updateAddress,
  updateProfile,
} from './customer.service';

const idSchema = z.string().trim().min(1).max(64);

export const customerRouter: Router = Router();

// Everything below belongs to an account; there is no guest view of any of it.
customerRouter.use(requireCustomer);

customerRouter.post(
  '/addresses',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, savedAddressSchema);
    res.status(201).json(await addAddress(customerIdOf(req), body));
  }),
);

customerRouter.put(
  '/addresses/:addressId',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, savedAddressSchema);
    const addressId = idSchema.parse(req.params.addressId);
    res.json(await updateAddress(customerIdOf(req), addressId, body));
  }),
);

customerRouter.delete(
  '/addresses/:addressId',
  asyncHandler(async (req, res) => {
    const addressId = idSchema.parse(req.params.addressId);
    res.json(await removeAddress(customerIdOf(req), addressId));
  }),
);

customerRouter.get(
  '/wishlist',
  asyncHandler(async (req, res) => {
    res.json(await getWishlist(customerIdOf(req)));
  }),
);

customerRouter.post(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    const productId = idSchema.parse(req.params.productId);
    res.json(await toggleWishlist(customerIdOf(req), productId));
  }),
);

/* --------------------------------- profile -------------------------------- */

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number')
    .nullish()
    .or(z.literal(''))
    .transform((value) => value || null),
  acceptsMarketing: z.boolean().optional().default(false),
});

customerRouter.put(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json(await updateProfile(customerIdOf(req), parseBody(req, profileSchema)));
  }),
);

customerRouter.put(
  '/password',
  asyncHandler(async (req, res) => {
    const body = parseBody(
      req,
      z.object({
        currentPassword: z.string().min(1, 'Enter your current password'),
        newPassword: passwordSchema,
      }),
    );

    await changePassword(customerIdOf(req), body.currentPassword, body.newPassword);
    res.status(204).end();
  }),
);

/* ----------------------------- payment methods ---------------------------- */

/**
 * The card number is accepted, used to derive the brand and last four, and
 * discarded. It is validated only for shape — a Luhn check here would reject
 * legitimate test cards and still not prove the card is chargeable.
 */
const paymentMethodSchema = z
  .object({
    type: z.enum(['card', 'upi']),
    cardNumber: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ''))
      .refine((value) => /^\d{12,19}$/.test(value), 'Enter a valid card number')
      .optional(),
    upiId: z
      .string()
      .trim()
      .regex(/^[\w.-]{2,64}@[a-zA-Z]{2,32}$/, 'Enter a UPI id like name@bank')
      .optional(),
    expiryMonth: z.coerce.number().int().min(1).max(12).optional(),
    expiryYear: z.coerce.number().int().min(2024).max(2100).optional(),
    label: z.string().trim().max(40).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => value.type !== 'card' || Boolean(value.cardNumber), {
    message: 'Enter the card number',
    path: ['cardNumber'],
  })
  .refine((value) => value.type !== 'upi' || Boolean(value.upiId), {
    message: 'Enter your UPI id',
    path: ['upiId'],
  })
  .refine(
    (value) =>
      value.type !== 'card' ||
      !value.expiryYear ||
      !value.expiryMonth ||
      // An expired card saved today is a failed checkout later, so it is caught
      // at the point the shopper can still fix it.
      new Date(value.expiryYear, value.expiryMonth, 0) > new Date(),
    { message: 'That card has expired', path: ['expiryYear'] },
  );

customerRouter.get(
  '/payment-methods',
  asyncHandler(async (req, res) => {
    res.json(await listPaymentMethods(customerIdOf(req)));
  }),
);

customerRouter.post(
  '/payment-methods',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, paymentMethodSchema);
    res.status(201).json(await addPaymentMethod(customerIdOf(req), body));
  }),
);

customerRouter.put(
  '/payment-methods/:methodId/default',
  asyncHandler(async (req, res) => {
    const methodId = idSchema.parse(req.params.methodId);
    res.json(await setDefaultPaymentMethod(customerIdOf(req), methodId));
  }),
);

customerRouter.delete(
  '/payment-methods/:methodId',
  asyncHandler(async (req, res) => {
    const methodId = idSchema.parse(req.params.methodId);
    res.json(await removePaymentMethod(customerIdOf(req), methodId));
  }),
);
