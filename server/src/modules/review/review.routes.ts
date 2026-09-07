import { Router } from 'express';
import { z } from 'zod';
import { FIT_FEEDBACK, SIZES } from '@shop/shared';

import { asyncHandler } from '../../lib/async-handler';
import { customerIdOf } from '../../lib/current-customer';
import { parseBody, parseQuery } from '../../lib/validate';
import { requireCustomer } from '../../middleware/authenticate';
import { createReview, listReviews } from './review.service';

const productIdSchema = z.string().trim().min(1).max(64);

const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Pick a rating').max(5),
  title: z.string().trim().max(120).optional(),
  body: z
    .string()
    .trim()
    .min(10, 'Tell us a little more — at least 10 characters')
    .max(2000),
  fitFeedback: z.enum(FIT_FEEDBACK).optional(),
  sizePurchased: z.enum(SIZES).optional(),
});

export const reviewRouter: Router = Router();

reviewRouter.get(
  '/:productId/reviews',
  asyncHandler(async (req, res) => {
    const productId = productIdSchema.parse(req.params.productId);
    const { page, pageSize } = parseQuery(
      req,
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(10),
      }),
    );

    res.json(await listReviews(productId, page, pageSize));
  }),
);

reviewRouter.post(
  '/:productId/reviews',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createReviewSchema);
    res.status(201).json(
      await createReview({
        productId: productIdSchema.parse(req.params.productId),
        customerId: customerIdOf(req),
        ...body,
      }),
    );
  }),
);
