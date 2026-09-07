import { useState } from 'react';
import type { AppliedCoupon } from '@shop/shared';

import { ApiRequestError } from '../../lib/api';
import { useCart } from '../../store/cart';

export const CouponBox = ({ coupon }: { coupon: AppliedCoupon | null }) => {
  const { applyCoupon, removeCoupon, isMutating } = useCart();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await applyCoupon(code);
      setCode('');
    } catch (cause) {
      // The bag store already surfaces a toast; this puts the reason next to the
      // input the shopper is looking at, which is where they expect it.
      setError(cause instanceof ApiRequestError ? cause.message : 'Could not apply that code');
    }
  };

  if (coupon) {
    return (
      <div className="coupon coupon-applied">
        <div>
          <strong>{coupon.code}</strong>
          <span className="muted"> · {coupon.description}</span>
        </div>
        <button
          type="button"
          className="link-btn"
          onClick={() => void removeCoupon()}
          disabled={isMutating}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <form className="coupon" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="coupon-code">
        Coupon code
      </label>
      <input
        id="coupon-code"
        className="input"
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        placeholder="Coupon code"
        aria-invalid={Boolean(error)}
        autoComplete="off"
      />
      <button type="submit" className="btn btn-outline" disabled={isMutating || !code.trim()}>
        Apply
      </button>
      {error ? (
        <span className="field-error coupon-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
};
