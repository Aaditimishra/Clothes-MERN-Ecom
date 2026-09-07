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

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
