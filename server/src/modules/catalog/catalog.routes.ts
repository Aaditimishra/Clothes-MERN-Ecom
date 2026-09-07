import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/async-handler';
import { parseQuery } from '../../lib/validate';
import { catalogQuerySchema } from './catalog.query';
import {
  getNavigation,
  getProductBySlug,
  getRelatedProducts,
  listProducts,
} from './catalog.service';

const slugParam = z.string().trim().toLowerCase().min(1).max(160);

export const catalogRouter: Router = Router();

catalogRouter.get(
  '/navigation',
  asyncHandler(async (_req, res) => {
    res.json(await getNavigation());
  }),
);

catalogRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    res.json(await listProducts(parseQuery(req, catalogQuerySchema)));
  }),
);

catalogRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    res.json(await getProductBySlug(slugParam.parse(req.params.slug)));
  }),
);

catalogRouter.get(
  '/products/:slug/related',
  asyncHandler(async (req, res) => {
    res.json(await getRelatedProducts(slugParam.parse(req.params.slug)));
  }),
);
