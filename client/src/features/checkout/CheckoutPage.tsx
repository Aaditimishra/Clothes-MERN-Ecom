import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatMoney, type PaymentMethod, type PlaceOrderResponse } from '@shop/shared';

import { ApiRequestError, request } from '../../lib/api';
import { forgetCart, useCart } from '../../store/cart';
import { useAuth } from '../../store/auth';
import { usePaymentOptions, useSettings } from '../../lib/store-config';
import { OrderSummary } from '../cart/OrderSummary';

export const CheckoutPage = () => {
  const { cart, isLoading } = useCart();
  const { customer } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const defaultAddress = customer?.addresses.find((address) => address.isDefault);
  const options = usePaymentOptions();
  /**
   * No default until the options arrive.
   *
   * Defaulting to `upi` and correcting later would let someone on a slow
   * connection submit a method this shop cannot honour, and be refused after
   * filling in the whole form.
   */
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const selected = method ?? options[0]?.method ?? null;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (body: unknown) =>
      request<PlaceOrderResponse>('/checkout', { method: 'POST', body, withCart: true }),
    onSuccess: (result) => {
      // The server deleted the bag when it became an order. Clearing the cached
      // copy stops the shopper returning to a bag that looks full and a checkout
      // that refuses them.
      forgetCart(queryClient);
      /**
       * The payment instructions ride along in navigation state.
       *
       * They are also fetchable from the order, and the confirmation page does
       * fetch them on a reload — but handing them over directly means the
       * shopper who just paid sees where to send the money without waiting on a
       * second round trip.
       */
      navigate(`/order/${result.order.reference}`, { state: result });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError) {
        setFieldErrors(error.fields);
        setFormError(error.message);
      } else {
        setFormError('Could not place your order. Please try again.');
      }
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    // Nothing to pay with. The server would refuse this anyway; refusing it here
    // saves the shopper a round trip to be told so.
    if (!selected) {
      setFormError('Choose how you would like to pay');
      return;
    }

    mutate({
      shippingAddress: {
        fullName: text('fullName'),
        phone: text('phone'),
        line1: text('line1'),
        line2: text('line2') || null,
        city: text('city'),
        state: text('state'),
        postalCode: text('postalCode'),
        country: 'IN',
      },
      paymentMethod: selected,
      ...(customer ? {} : { email: text('email') }),
    });
  };

  if (isLoading) {
    return (
      <div className="shell page">
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="shell empty-state">
        <h1 className="section-title">Nothing to check out</h1>
        <p className="muted">Your bag is empty.</p>
        <Link to="/shop" className="btn btn-primary btn-lg">
          Start shopping
        </Link>
      </div>
    );
  }

  const error = (name: string) => fieldErrors[`shippingAddress.${name}`] ?? fieldErrors[name];
  const codFee = settings?.shipping.codSurcharge.amount ?? 0;

  return (
    <div className="shell page checkout">
      <h1 className="section-title">Checkout</h1>

      <form className="checkout-layout" onSubmit={handleSubmit} noValidate>
        <div className="checkout-main stack" style={{ '--stack-gap': '28px' } as React.CSSProperties}>
          {formError ? (
            <p className="notice notice-error" role="alert">
              {formError}
            </p>
          ) : null}

          {!customer ? (
            <section>
              <h2 className="checkout-step">1 · Contact</h2>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  name="email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(error('email'))}
                />
                {error('email') ? <span className="field-error">{error('email')}</span> : null}
              </label>
              <p className="muted checkout-guest-note">
                Checking out as a guest.{' '}
                <Link to="/sign-in" className="link-btn">
                  Sign in
                </Link>{' '}
                to use a saved address.
              </p>
            </section>
          ) : null}

          <section>
            <h2 className="checkout-step">{customer ? '1' : '2'} · Delivery address</h2>

            <div className="grid-2">
              <label className="field">
                <span className="field-label">Full name</span>
                <input
                  name="fullName"
                  className="input"
                  autoComplete="name"
                  defaultValue={defaultAddress?.fullName ?? ''}
                  required
                  aria-invalid={Boolean(error('fullName'))}
                />
                {error('fullName') ? <span className="field-error">{error('fullName')}</span> : null}
              </label>

              <label className="field">
                <span className="field-label">Mobile number</span>
                <input
                  name="phone"
                  className="input"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  defaultValue={defaultAddress?.phone ?? ''}
                  required
                  aria-invalid={Boolean(error('phone'))}
                />
                {error('phone') ? <span className="field-error">{error('phone')}</span> : null}
              </label>
            </div>

            <label className="field">
              <span className="field-label">Address</span>
              <input
                name="line1"
                className="input"
                autoComplete="address-line1"
                defaultValue={defaultAddress?.line1 ?? ''}
                required
                aria-invalid={Boolean(error('line1'))}
              />
              {error('line1') ? <span className="field-error">{error('line1')}</span> : null}
            </label>

            <label className="field">
              <span className="field-label">Apartment, landmark (optional)</span>
              <input
                name="line2"
                className="input"
                autoComplete="address-line2"
                defaultValue={defaultAddress?.line2 ?? ''}
              />
            </label>

            <div className="grid-3">
              <label className="field">
                <span className="field-label">City</span>
                <input
                  name="city"
                  className="input"
                  autoComplete="address-level2"
                  defaultValue={defaultAddress?.city ?? ''}
                  required
                  aria-invalid={Boolean(error('city'))}
                />
                {error('city') ? <span className="field-error">{error('city')}</span> : null}
              </label>

              <label className="field">
                <span className="field-label">State</span>
                <input
                  name="state"
                  className="input"
                  autoComplete="address-level1"
                  defaultValue={defaultAddress?.state ?? ''}
                  required
                  aria-invalid={Boolean(error('state'))}
                />
                {error('state') ? <span className="field-error">{error('state')}</span> : null}
              </label>

              <label className="field">
                <span className="field-label">PIN code</span>
                <input
                  name="postalCode"
                  className="input"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  defaultValue={defaultAddress?.postalCode ?? ''}
                  required
                  aria-invalid={Boolean(error('postalCode'))}
                />
                {error('postalCode') ? (
                  <span className="field-error">{error('postalCode')}</span>
                ) : null}
              </label>
            </div>
          </section>

          <section>
            <h2 className="checkout-step">{customer ? '2' : '3'} · Payment</h2>
            {options.length === 0 ? (
              <p className="field-error">
                This shop cannot take payments at the moment. Please contact us before
                ordering.
              </p>
            ) : (
              <div className="pay-methods">
                {options.map((option) => (
                  <label
                    key={option.method}
                    className={`pay${selected === option.method ? ' is-active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={option.method}
                      checked={selected === option.method}
                      onChange={() => setMethod(option.method)}
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <span className="muted">
                        {option.method === 'cod' && codFee > 0
                          ? `${formatMoney({ amount: codFee, currency: 'INR' })} handling fee`
                          : option.note}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/*
              Said before the order is placed, not after.
              A shopper who expects to be charged on this page and is instead
              asked to transfer the money themselves reads it as the payment
              having failed, and either abandons the order or pays twice.
            */}
            {selected && options.find((o) => o.method === selected)?.provider === 'manual' ? (
              <p className="muted checkout-demo-note">
                You will be shown our UPI and bank details on the next page. Your order is
                confirmed once we have seen the money arrive.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="checkout-aside">
          <h2 className="cart-aside-title">Your order</h2>

          <ul className="checkout-lines">
            {cart.lines.map((line) => (
              <li key={line.variantId}>
                {line.imageUrl ? (
                  <img src={line.imageUrl} alt="" width={56} height={75} loading="lazy" />
                ) : null}
                <div>
                  <p className="checkout-line-name">{line.name}</p>
                  <p className="muted">
                    {line.size.toUpperCase()} · {line.colourLabel} · Qty {line.quantity}
                  </p>
                </div>
                <strong>{formatMoney(line.lineTotal)}</strong>
              </li>
            ))}
          </ul>

          <OrderSummary
            totals={
              selected === 'cod'
                ? {
                    ...cart.totals,
                    // Mirrors the server's COD surcharge so the total on screen
                    // matches the one about to be charged. The amount comes from
                    // settings, not a literal, so changing the fee in the admin
                    // changes both sides at once. The server stays the authority.
                    shipping: {
                      ...cart.totals.shipping,
                      amount: cart.totals.shipping.amount + codFee,
                    },
                    grandTotal: {
                      ...cart.totals.grandTotal,
                      amount: cart.totals.grandTotal.amount + codFee,
                    },
                  }
                : cart.totals
            }
            couponCode={cart.coupon?.code}
          />

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={isPending || cart.issues.length > 0 || !selected}
          >
            {isPending ? 'Placing order…' : 'Place order'}
          </button>

          {cart.issues.length > 0 ? (
            <p className="field-error">
              Some items are unavailable.{' '}
              <Link to="/cart" className="link-btn">
                Review your bag
              </Link>
            </p>
          ) : null}
        </aside>
      </form>
    </div>
  );
};
