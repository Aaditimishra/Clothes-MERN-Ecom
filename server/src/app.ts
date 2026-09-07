import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { attachCustomer } from './middleware/authenticate';
import { authRouter } from './modules/auth/auth.routes';
import { cartRouter } from './modules/cart/cart.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { customerRouter } from './modules/customer/customer.routes';
import { orderRouter } from './modules/order/order.routes';
import { paymentRouter, paymentWebhookRouter } from './modules/payment/payment.routes';
import { reviewRouter } from './modules/review/review.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { storefrontRouter } from './modules/storefront/storefront.routes';
import { PUBLIC_PREFIX, STORAGE_ROOT } from './modules/media/media.storage';

export const createApp = (): Express => {
  const app = express();

  // Behind a proxy the client IP is in X-Forwarded-For. Without this, rate
  // limiting sees one address for every visitor and throttles the whole shop
  // the moment it is deployed behind a load balancer.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      /**
       * Uploaded images are served from this origin and embedded by the
       * storefront on another (5173 in development). The default
       * `same-origin` policy blocks exactly that, so every product photo would
       * 404 in the browser while returning 200 to curl — a confusing failure
       * worth avoiding.
       */
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(
    cors({
      origin: env.corsOrigins,
      // The bag id rides in a custom header, so it must be allowed explicitly —
      // CORS permits only a short list of simple headers by default.
      allowedHeaders: ['Content-Type', 'Authorization', 'x-cart-id'],
    }),
  );
  /**
   * The gateway webhook is mounted BEFORE the JSON parser, deliberately.
   *
   * Its signature is computed over the exact bytes Razorpay sent, and
   * `express.json` marks a request as parsed — after which the route's own
   * `raw()` silently does nothing and hands back a re-serialised object whose
   * digest can never match. Moving this line below the parser rejects every
   * genuine webhook as a forgery, which presents as payments never confirming.
   *
   * It also sits above the rate limiter: a burst of retries from the gateway
   * must not be throttled as though it were a shopper refreshing.
   */
  app.use('/api/payments/webhook', paymentWebhookRouter);

  // A 100 kB body is generous for the largest thing this API accepts (a review).
  // The default of 100 kB is kept explicit so raising it is a decision, not a
  // side effect of someone reaching for a bigger payload.
  app.use(express.json({ limit: '100kb' }));

  if (!env.isProduction) app.use(morgan('dev'));

  /**
   * Uploaded images, served straight off disk.
   *
   * `immutable` is safe because a key is never reused: re-uploading produces a
   * new key, so a cached file can never be stale. That turns product photography
   * into a single fetch per visitor per year.
   */
  if (!existsSync(STORAGE_ROOT)) mkdirSync(STORAGE_ROOT, { recursive: true });
  app.use(
    PUBLIC_PREFIX,
    express.static(STORAGE_ROOT, {
      maxAge: '1y',
      immutable: true,
      index: false,
      dotfiles: 'deny',
    }),
  );

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      // Sized for browsing: a shopper loading a listing fires a handful of
      // requests per page. Credential routes set their own, far tighter limit.
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  /**
   * Reports the database too.
   *
   * A health check that only proves the process is running will happily report
   * healthy while every request fails — which is exactly when an orchestrator
   * most needs to know to restart or stop routing traffic.
   */
  app.get('/api/health', (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'degraded',
      database: connected ? 'connected' : 'disconnected',
      uptime: Math.round(process.uptime()),
    });
  });

  // Runs before every route: routes that merely behave differently when signed
  // in get an identity, and the few that require one check for it themselves.
  app.use('/api', attachCustomer);

  app.use('/api/storefront', storefrontRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/account', customerRouter);
  app.use('/api/products', reviewRouter);
  app.use('/api', orderRouter);
  app.use('/api', paymentRouter);

  // Mounted last, and behind its own authentication. Nothing above this line
  // knows the admin exists.
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
