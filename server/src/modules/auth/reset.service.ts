import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { newId } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { CustomerModel } from '../../models/customer.model';
import { ResetTokenModel } from '../../models/reset-token.model';
import { StaffModel } from '../../models/staff.model';
import { queuePasswordReset } from '../notification/notification.service';

export type ResetAudience = 'customer' | 'staff';

/** Long enough that guessing is hopeless, short enough to paste from an email. */
const TOKEN_BYTES = 32;
const TOKEN_TTL_MINUTES = 60;
const BCRYPT_ROUNDS = 12;

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const findSubject = async (audience: ResetAudience, email: string) =>
  audience === 'staff'
    ? StaffModel.findOne({ email, isActive: true }).select('_id name email').lean()
    : CustomerModel.findOne({ email }).select('_id firstName email').lean();

/**
 * Starts a reset. Always reports success.
 *
 * Telling the caller whether an address exists turns this endpoint into a
 * membership oracle — paste in a list of emails, keep the ones that come back
 * "sent". The person who genuinely owns the address finds out from their inbox,
 * which is the only place that can safely tell them.
 */
export const requestPasswordReset = async (
  audience: ResetAudience,
  rawEmail: string,
  resetUrlBase: string,
): Promise<void> => {
  const email = rawEmail.toLowerCase().trim();
  const subject = await findSubject(audience, email);

  if (!subject) return;

  // Any token already outstanding is retired. Two live reset links for one
  // account means an old email forwarded to the wrong person still works.
  await ResetTokenModel.updateMany(
    { subjectId: subject._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await ResetTokenModel.create({
    _id: newId('rst'),
    audience,
    subjectId: subject._id,
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
  });

  const name =
    'firstName' in subject ? subject.firstName : (subject as { name: string }).name;

  await queuePasswordReset({
    to: email,
    name,
    link: `${resetUrlBase}?token=${token}`,
    minutes: TOKEN_TTL_MINUTES,
    subjectId: subject._id,
  });
};

export const completePasswordReset = async (
  audience: ResetAudience,
  token: string,
  newPassword: string,
): Promise<void> => {
  const record = await ResetTokenModel.findOne({
    audience,
    tokenHash: hashToken(token),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  // One message for expired, already-used and never-existed. Distinguishing them
  // tells someone holding a stale link whether it was ever real.
  if (!record) {
    throw ApiError.badRequest('That reset link is no longer valid. Request a new one.', {
      token: 'Expired or already used',
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const updated =
    audience === 'staff'
      ? await StaffModel.updateOne({ _id: record.subjectId }, { $set: { passwordHash } })
      : await CustomerModel.updateOne({ _id: record.subjectId }, { $set: { passwordHash } });

  if (updated.matchedCount === 0) {
    throw ApiError.badRequest('That account no longer exists');
  }

  // Marked used only after the password actually changed, so a failed write
  // leaves the link usable rather than burning it.
  record.usedAt = new Date();
  await record.save();
};
