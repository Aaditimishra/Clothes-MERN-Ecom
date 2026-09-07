import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment, validated once at boot.
 *
 * The process exits here rather than deep in a request handler. A missing
 * `JWT_SECRET` discovered at sign-in time is an outage with a confusing stack
 * trace; discovered at boot it is a one-line message before anything serves
 * traffic.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * Sign-in, sign-up and password-reset attempts allowed per IP per 15 minutes.
   *
   * Ten is right for people. The smoke suite makes far more than that on
   * purpose — it exercises every credential path — so it raises this rather
   * than the suite being trimmed to fit a production number.
   */
  CREDENTIAL_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(10),
  /**
   * Requests allowed per IP per minute, across everything.
   *
   * Sized for browsing: a shopper loading a listing fires a handful per page.
   * The smoke suite is not browsing — it walks every path in the shop in about
   * a minute — so it raises this rather than the suite being trimmed to fit a
   * number that exists to describe a person.
   */
  GLOBAL_RATE_LIMIT: z.coerce.number().int().min(1).max(100_000).default(300),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/threadline'),
  /**
   * Rejected below 32 characters on purpose: a short secret is brute-forceable,
   * and the default-secret-in-production mistake is common enough to be worth a
   * hard failure rather than a warning nobody reads.
   */
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .default('dev-only-secret-change-me-before-you-deploy'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** Comma-separated list of origins allowed to call the API. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /**
   * Razorpay credentials. Optional, and absent by design until the shop has an
   * account.
   *
   * They are environment secrets rather than settings rows because an admin
   * session must never be able to read the key that signs refunds. The shop
   * runs on manual transfers without them; supplying them is what makes the
   * gateway available to be switched on.
   */
  RAZORPAY_KEY_ID: z.string().trim().default(''),
  RAZORPAY_KEY_SECRET: z.string().trim().default(''),
  /**
   * Verifies the webhook body's signature. Distinct from the key secret because
   * Razorpay signs webhooks with its own value, and an unverified webhook is an
   * open endpoint that marks any order paid on request.
   */
  RAZORPAY_WEBHOOK_SECRET: z.string().trim().default(''),

  /**
   * How long an unpaid order holds its stock, in hours.
   *
   * Stock is reserved the moment the order is written, so an abandoned transfer
   * takes a garment off sale until something takes it back. Twenty-four hours
   * is long enough for someone who pays from a different device in the evening
   * and short enough that a size does not sit dead for a week.
   */
  PAYMENT_WINDOW_HOURS: z.coerce.number().int().min(1).max(720).default(24),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const raw = parsed.data;

if (raw.NODE_ENV === 'production' && raw.JWT_SECRET.startsWith('dev-only-secret')) {
  console.error('Refusing to start in production with the development JWT secret.');
  process.exit(1);
}

/**
 * A gateway is CONFIGURED when both halves of the key pair are present.
 *
 * Checked as a pair rather than individually: a key id with no secret produces
 * a checkout the shopper can open and the server can never verify, which takes
 * their money and loses the order.
 */
const razorpayConfigured = Boolean(raw.RAZORPAY_KEY_ID && raw.RAZORPAY_KEY_SECRET);

if (raw.NODE_ENV === 'production' && razorpayConfigured && !raw.RAZORPAY_WEBHOOK_SECRET) {
  console.warn(
    'Razorpay is configured without RAZORPAY_WEBHOOK_SECRET. Payments will be ' +
      'confirmed from the browser handoff only, so a shopper who closes the tab ' +
      'after paying leaves the order unconfirmed until someone checks by hand.',
  );
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  razorpayConfigured,
} as const;
