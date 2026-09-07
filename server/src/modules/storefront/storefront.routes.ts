import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { availablePaymentOptions } from '../../lib/payments/policy';
import { toPublicSettings } from '../settings/settings.service';
import { parseQuery } from '../../lib/validate';
import { getSettings } from '../settings/settings.service';
import { groupedTaxonomy } from '../taxonomy/taxonomy.service';
import { footerLinks, getPage } from '../content/content.service';
import { getPost, listPosts } from '../content/journal.service';
import { z } from 'zod';

export const storefrontRouter: Router = Router();

/**
 * Everything the shop needs before it can render its own chrome, in one request.
 *
 * Settings and the vocabulary are needed by the header, the filter panel and the
 * bag summary alike. Fetching them separately would mean three requests on every
 * cold load and three chances to render a half-configured page; fetching them
 * together means the app either has its configuration or it does not.
 *
 * Both halves are cached server-side, so this is cheap to call.
 */
storefrontRouter.get(
  '/bootstrap',
  asyncHandler(async (_req, res) => {
    const [settings, taxonomy, footer] = await Promise.all([
      getSettings(),
      groupedTaxonomy(),
      footerLinks(),
    ]);

    // Revalidate every time rather than serving a stale copy for a minute.
    // Express already sends an ETag, so an unchanged bootstrap costs a 304 and
    // no body — nearly as cheap as the timed cache, and never wrong.
    res.set('Cache-Control', 'no-cache');
    res.json({
      settings: toPublicSettings(settings),
      taxonomy,
      footer,
      /**
       * Which ways to pay this shop can actually honour.
       *
       * Sent from here rather than hardcoded in the storefront because the
       * answer depends on settings and on whether gateway keys exist in the
       * environment — which a browser cannot know and must not be told.
       */
      paymentOptions: availablePaymentOptions(settings),
    });
  }),
);

/**
 * A content page.
 *
 * `no-cache` means "ask first", not "do not store": the browser keeps the copy
 * and revalidates against the ETag, so an unchanged page still costs one 304.
 *
 * The timed cache that used to be here was a real bug — a merchant edited a
 * page in the admin, reloaded the shop, saw the old copy for five minutes and
 * had no way to tell whether the save had failed.
 */
storefrontRouter.get(
  '/pages/:slug',
  asyncHandler(async (req, res) => {
    const slug = z.string().trim().toLowerCase().min(1).max(120).parse(req.params.slug);
    res.set('Cache-Control', 'no-cache');
    res.json(await getPage(slug));
  }),
);

/* -------------------------------- journal -------------------------------- */

storefrontRouter.get(
  '/journal',
  asyncHandler(async (req, res) => {
    const { category, limit } = parseQuery(
      req,
      z.object({
        category: z.string().trim().max(60).optional(),
        limit: z.coerce.number().int().min(1).max(24).optional(),
      }),
    );

    res.set('Cache-Control', 'no-cache');
    res.json(await listPosts({ ...(category ? { category } : {}), ...(limit ? { limit } : {}) }));
  }),
);

storefrontRouter.get(
  '/journal/:slug',
  asyncHandler(async (req, res) => {
    const slug = z.string().trim().toLowerCase().min(1).max(160).parse(req.params.slug);
    res.set('Cache-Control', 'no-cache');
    res.json(await getPost(slug));
  }),
);
