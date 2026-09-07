import mongoose from 'mongoose';

import { env } from './env';

/**
 * Fail fast rather than queue.
 *
 * By default Mongoose buffers commands while disconnected, so a database that is
 * down turns into requests that hang for thirty seconds and then fail. Off, a
 * query errors immediately and the health check tells the truth.
 */
mongoose.set('bufferCommands', false);
// Ignore keys that are not in the schema instead of writing them, so a typo in a
// field name is dropped rather than silently stored under the wrong path.
mongoose.set('strictQuery', true);

export const connectDatabase = async (): Promise<void> => {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5_000,
    autoIndex: !env.isProduction,
  });

  console.info(`[db] connected to ${redact(env.MONGODB_URI)}`);
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};

/** Connection strings carry credentials; logs are not the place for them. */
const redact = (uri: string): string => uri.replace(/\/\/[^@]+@/, '//***@');
