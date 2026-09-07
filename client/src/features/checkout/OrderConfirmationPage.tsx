import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatMoney, type OrderView } from '@shop/shared';

import { request } from '../../lib/api';
import { OrderSummary } from '../cart/OrderSummary';
import { NotFoundPage } from '../NotFoundPage';

export const OrderConfirmationPage = () => {
  const { reference } = useParams<{ reference: string }>();
  const location = useLocation();

  /**
   * The order just placed is passed through router state.
   *
   * Used as the initial data so the confirmation renders instantly instead of
   * flashing a skeleton for something the previous request already returned. A
   * direct visit or a refresh has no state, and falls back to fetching.
   */
  const placed = (location.state as { order?: OrderView } | null)?.order;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', reference],
    queryFn: () => request<OrderView>(`/orders/${reference}`),
    ...(placed?.reference === reference ? { initialData: placed } : {}),
    enabled: Boolean(reference),
  });

  if (isLoading) {
    return (
      <div className="shell page">
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (isError || !data) return <NotFoundPage />;

  const eta = data.estimatedDelivery
    ? new Date(data.estimatedDelivery).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;

  return (
    <div className="shell page confirmation">
      <div className="confirmation-head">
        <span className="confirmation-tick" aria-hidden="true">
          ✓
        </span>
        <h1 className="section-title">Order confirmed</h1>
        <p className="muted">
          Order <strong>{data.reference}</strong> · a confirmation is on its way to your
          email.
        </p>
        {eta ? <p className="confirmation-eta">Arriving by {eta}</p> : null}
      </div>

      <div className="confirmation-body">
        <section>
          <h2 className="cart-aside-title">Items</h2>
          <ul className="checkout-lines">
            {data.lines.map((line) => (
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

          <h2 className="cart-aside-title">Delivering to</h2>
          <address className="confirmation-address">
            {data.shippingAddress.fullName}
            <br />
            {data.shippingAddress.line1}
            {data.shippingAddress.line2 ? (
              <>
                <br />
                {data.shippingAddress.line2}
              </>
            ) : null}
            <br />
            {data.shippingAddress.city}, {data.shippingAddress.state}{' '}
            {data.shippingAddress.postalCode}
            <br />
            {data.shippingAddress.phone}
          </address>
        </section>

        <aside className="cart-aside">
          <h2 className="cart-aside-title">Payment</h2>
          <p className="muted confirmation-payment">
            {data.paymentMethod.toUpperCase()} ·{' '}
            {data.paymentStatus === 'paid' ? 'Paid' : 'Due on delivery'}
          </p>
          <OrderSummary totals={data.totals} couponCode={data.couponCode} />
          <Link to="/shop" className="btn btn-primary btn-block">
            Continue shopping
          </Link>
          <Link to="/account" className="btn btn-ghost btn-block">
            View your orders
          </Link>
        </aside>
      </div>
    </div>
  );
};
