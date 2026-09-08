import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../../config/env';
import type { EmailDelivery } from './notification.service';

/**
 * Actually sending the mail.
 *
 * The outbox adapter records every message and sends none, which is the honest
 * default for a shop with no mail account. This is the other half: give it SMTP
 * credentials and the same messages leave the building.
 *
 * It stays a separate file, and stays OPTIONAL, because the two failure modes
 * are opposite. A shop that thinks it is sending and is not will not notice for
 * weeks; a shop that is sending through a misconfigured relay will find out
 * from its customers. Neither should be the default, so the shop only sends
 * when somebody has deliberately supplied credentials.
 */
export const createSmtpDelivery = (): EmailDelivery => {
  let transport: Transporter | null = null;

  /**
   * Built on first use, not at import.
   *
   * `createTransport` opens a connection pool, and doing that at module load
   * would make an unconfigured shop pay for a pool it never sends through — and
   * would move any configuration error from the first email to boot time, where
   * it takes the whole API down over an email.
   */
  const connect = (): Transporter => {
    transport ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 is implicit TLS; 587 upgrades with STARTTLS. Deriving it from the
      // port is what stops the two being configured to disagree.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
    return transport;
  };

  return {
    name: 'smtp',
    async send(message) {
      await connect().sendMail({
        from: env.MAIL_FROM || env.SMTP_USER,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
    },
  };
};
