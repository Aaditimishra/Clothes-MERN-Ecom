import { model, Schema, type InferSchemaType } from 'mongoose';

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'INR', uppercase: true },
  },
  { _id: false },
);

const couponSchema = new Schema(
  {
    _id: { type: String, required: true },
    /** Uppercased on write so `flat20` and `FLAT20` are the same coupon. */
    code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    description: { type: String, required: true },
    type: { type: String, required: true, enum: ['percentage', 'fixed'] },
    /** Percent (e.g. `20`) for percentage coupons; ignored for fixed. */
    percentage: { type: Number, default: null },
    /** Absolute discount for fixed coupons; ignored for percentage. */
    amountOff: { type: moneySchema, default: null },
    /**
     * The cap that makes percentage coupons safe.
     *
     * "20% off" on a ₹40,000 bag is ₹8,000 the shop never intended to give.
     * Every percentage coupon carries a ceiling.
     */
    maxDiscount: { type: moneySchema, default: null },
    minSpend: { type: moneySchema, default: null },
    isActive: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    /** `null` means unlimited. Decremented atomically at checkout. */
    usageLimit: { type: Number, default: null },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'coupons', _id: false },
);

// The coupons list, newest first.
couponSchema.index({ createdAt: -1, _id: 1 });

export type CouponDoc = InferSchemaType<typeof couponSchema>;
export const CouponModel = model('Coupon', couponSchema);
