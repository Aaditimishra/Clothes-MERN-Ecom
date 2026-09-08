import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { sweepExpiredPayments } from './modules/payment/payment.service';
import { useEmailDelivery } from './modules/notification/notification.service';
import { createSmtpDelivery } from './modules/notification/smtp.delivery';

const start = async (): Promise<void> => {
  await connectDatabase();

  /**
   * Mail goes out only when somebody has supplied credentials.
   *
   * Announced either way, and deliberately: "recording to the outbox" is a
   * state a merchant needs to know they are in, because the alternative is
   * discovering weeks later that no confirmation ever reached anybody.
   */
  if (env.smtpConfigured) {
    useEmailDelivery(createSmtpDelivery());
    console.info(`[mail] sending through ${env.SMTP_HOST} as ${env.SMTP_USER}`);
  } else {
    console.info(
      '[mail] no SMTP configured — every message is recorded in the outbox and ' +
        'nothing is sent. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD to send.',
    );
  }

  const server = createApp().listen(env.PORT, () => {
    console.info(`[api] listening on http://localhost:${env.PORT}`);
  });

  /**
   * Returns the stock held by orders nobody paid for.
   *
   * Stock is reserved the moment an order is written, so an abandoned bank
   * transfer takes a garment off sale until something gives it back — and the
   * sizes people abandon at checkout are disproportionately the ones that were
   * nearly sold out. Five minutes is far more often than the deadline needs,
   * and the query is one indexed lookup that usually matches nothing.
   *
   * `unref` so a pending timer cannot hold the process open during a deploy.
   */
  const sweeper = setInterval(() => {
    void sweepExpiredPayments().catch((error: unknown) => {
      // A failed sweep must never take the API down with it. The next tick
      // retries, and the orders it missed are still there to be found.
      console.error('[payment] sweep failed', error);
    });
  }, 5 * 60 * 1000);
  sweeper.unref();

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

    clearInterval(sweeper);

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
