import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatMoney, type PlaceOrderResponse, type OrderView } from '@shop/shared';

import { request } from '../../lib/api';
import { OrderSummary } from '../cart/OrderSummary';
import { PaymentPanel } from './PaymentPanel';
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
  const state = location.state as PlaceOrderResponse | null;
  const placed = state?.order;

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

  /**
   * The heading tells the truth about whether this order is actually placed.
   *
   * "Order confirmed" over an order that is awaiting a bank transfer is the
   * single most expensive lie this page could tell: the shopper stops, never
   * sends the money, and the shop holds stock for an order nobody is coming
   * back to. It is confirmed when it is paid, or when it is cash on delivery.
   */
  const isSettled = data.paymentStatus === 'paid' || data.paymentStatus === 'pending';

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
          {isSettled ? '✓' : '•'}
        </span>
        <h1 className="section-title">
          {isSettled ? 'Order confirmed' : 'Almost there — your order needs paying'}
        </h1>
        <p className="muted">
          Order <strong>{data.reference}</strong>
          {isSettled
            ? ' · a confirmation is on its way to your email.'
            : ' · we have saved your items. Send the payment below and we will confirm it.'}
        </p>
        {isSettled && eta ? <p className="confirmation-eta">Arriving by {eta}</p> : null}
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
          <PaymentPanel
            order={data}
            handoff={{ manual: state?.manual ?? null, gateway: state?.gateway ?? null }}
          />
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
