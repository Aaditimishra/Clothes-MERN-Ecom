import { model, Schema, type InferSchemaType } from 'mongoose';

/**
 * A single-use password reset token.
 *
 * Only the HASH is stored. A reset token is a bearer credential for one account
 * — anyone holding it can take the account over — so a leaked database dump must
 * not contain anything that can be replayed. Same reasoning as a password.
 */
const resetTokenSchema = new Schema(
  {
    _id: { type: String, required: true },
    /** `customer` or `staff`. The two live in different collections. */
    audience: { type: String, required: true },
    subjectId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    tokenHash: { type: String, required: true, index: true },
    usedAt: { type: Date, default: null },
    /**
     * Expired tokens are swept by the database rather than a cron job.
     *
     * A cleanup job that stops running leaves live credentials lying around,
     * which is the one kind of leftover that actually matters here.
     */
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true, collection: 'reset_tokens', _id: false },
);

export type ResetTokenDoc = InferSchemaType<typeof resetTokenSchema>;
export const ResetTokenModel = model('ResetToken', resetTokenSchema);
