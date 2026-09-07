import { money, type AppliedCoupon, type Money } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { CouponModel, type CouponDoc } from '../../models/coupon.model';

/**
 * Works out what a coupon is worth against a given subtotal.
 *
 * Percentage coupons are capped by `maxDiscount`, and every coupon is capped by
 * the subtotal itself. Both caps matter: without the first, "20% off" on a large
 * bag gives away more than the campaign intended; without the second, a fixed
 * ₹500 coupon on a ₹300 bag would produce a negative total and a refund the shop
 * never agreed to.
 */
export const discountFor = (coupon: CouponDoc, subtotal: Money): Money => {
  const raw =
    coupon.type === 'percentage'
      ? money(Math.round((subtotal.amount * (coupon.percentage ?? 0)) / 100))
      : money(coupon.amountOff?.amount ?? 0);

  const capped = coupon.maxDiscount
    ? Math.min(raw.amount, coupon.maxDiscount.amount)
    : raw.amount;

  return money(Math.min(capped, subtotal.amount));
};

export interface CouponCheck {
  coupon: CouponDoc;
  applied: AppliedCoupon;
}

/**
 * Validates a code against the bag it is being used on.
 *
 * Every rejection names the reason, because "invalid code" when the real problem
 * is a ₹1,999 minimum spend sends the shopper away instead of one item closer to
 * qualifying.
 */
export const checkCoupon = async (
  rawCode: string,
  subtotal: Money,
  now = new Date(),
): Promise<CouponCheck> => {
  const code = rawCode.trim().toUpperCase();
  const coupon = await CouponModel.findOne({ code }).lean();

  if (!coupon || !coupon.isActive) {
    throw ApiError.unprocessable(`'${code}' is not a valid code`, {
      couponCode: 'Not a valid code',
    });
  }

  if (coupon.startsAt && now < coupon.startsAt) {
    throw ApiError.unprocessable(`'${code}' is not active yet`, {
      couponCode: 'Not active yet',
    });
  }

  if (coupon.endsAt && now > coupon.endsAt) {
    throw ApiError.unprocessable(`'${code}' has expired`, { couponCode: 'Expired' });
  }

  if (coupon.usageLimit != null && (coupon.usageCount ?? 0) >= coupon.usageLimit) {
    throw ApiError.unprocessable(`'${code}' has been fully claimed`, {
      couponCode: 'Fully claimed',
    });
  }

  if (coupon.minSpend && subtotal.amount < coupon.minSpend.amount) {
    const shortfall = (coupon.minSpend.amount - subtotal.amount) / 100;
    throw ApiError.unprocessable(
      `Spend ₹${shortfall.toFixed(0)} more to use '${code}'`,
      { couponCode: 'Minimum spend not met' },
    );
  }

  return {
    coupon,
    applied: {
      code: coupon.code,
      description: coupon.description,
      discount: discountFor(coupon, subtotal),
    },
  };
};

/**
 * The non-throwing form, for rebuilding a bag that already has a code attached.
 *
 * A coupon can expire while it sits in someone's bag. That must not make the bag
 * itself unreadable — it simply stops applying, and the shopper is told at the
 * point they try to pay.
 */
export const tryCoupon = async (
  rawCode: string | null,
  subtotal: Money,
): Promise<AppliedCoupon | null> => {
  if (!rawCode) return null;
  try {
    return (await checkCoupon(rawCode, subtotal)).applied;
  } catch {
    return null;
  }
};

/**
 * Claims one use, atomically.
 *
 * The guard in the filter is the whole point: two shoppers redeeming the last
 * use of a code at the same moment would both pass a read-then-write check.
 * Here the second update matches nothing and the code is simply not applied.
 */
export const claimCouponUse = async (code: string): Promise<boolean> => {
  const result = await CouponModel.updateOne(
    {
      code: code.toUpperCase(),
      isActive: true,
      $or: [{ usageLimit: null }, { $expr: { $lt: ['$usageCount', '$usageLimit'] } }],
    },
    { $inc: { usageCount: 1 } },
  );

  return result.modifiedCount === 1;
};
