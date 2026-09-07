import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';

const start = async (): Promise<void> => {
  await connectDatabase();

  const server = createApp().listen(env.PORT, () => {
    console.info(`[api] listening on http://localhost:${env.PORT}`);
  });

  /**
   * Stop accepting connections, finish what is in flight, then close the
   * database.
   *
   * Exiting the moment SIGTERM arrives cuts off requests mid-write — during a
   * rolling deploy that is a shopper whose order was reserved stock but never
   * recorded. The timeout is the backstop for a connection that never drains.
   */
  const shutdown = (signal: string): void => {
    console.info(`[api] ${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
      console.error('[api] shutdown timed out, exiting');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(() => {
      void disconnectDatabase().then(() => process.exit(0));
    });
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => shutdown(signal));
  }
};

start().catch((error: unknown) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});
