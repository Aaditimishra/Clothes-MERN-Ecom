import { Link } from 'react-router-dom';
import { formatMoney } from '@shop/shared';

import { QuantityStepper } from '../../components/QuantityStepper';
import { useCart } from '../../store/cart';
import { CouponBox } from './CouponBox';
import { OrderSummary } from './OrderSummary';

export const CartPage = () => {
  const { cart, isLoading, setQuantity, removeItem, isMutating } = useCart();

  if (isLoading) {
    return (
      <div className="shell page">
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="shell empty-state">
        <h1 className="section-title">Your bag is empty</h1>
        <p className="muted">Once you add something, it will show up here.</p>
        <Link to="/shop" className="btn btn-primary btn-lg">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="shell page cart-page">
      <h1 className="section-title">Your bag ({cart.itemCount})</h1>

      <div className="cart-layout">
        <section>
          {cart.issues.length > 0 ? (
            <ul className="notice notice-error cart-issues">
              {cart.issues.map((issue) => (
                <li key={issue.variantId}>{issue.message}</li>
              ))}
            </ul>
          ) : null}

          <ul className="cart-lines">
            {cart.lines.map((line) => (
              <li key={line.variantId} className={line.isAvailable ? '' : 'is-unavailable'}>
                <Link to={`/product/${line.productSlug}`}>
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt="" width={110} height={147} loading="lazy" />
                  ) : (
                    <div className="drawer-line-noimg" />
                  )}
                </Link>

                <div className="cart-line-body">
                  <p className="cart-line-brand">{line.brand}</p>
                  <Link to={`/product/${line.productSlug}`} className="cart-line-name">
                    {line.name}
                  </Link>
                  <p className="muted">
                    Size {line.size.toUpperCase()} · {line.colourLabel}
                  </p>
                  <p className="muted cart-line-sku">{line.sku}</p>

                  <div className="cart-line-controls">
                    <QuantityStepper
                      value={line.quantity}
                      max={Math.max(1, line.available)}
                      disabled={isMutating}
                      onChange={(next) => void setQuantity(line.variantId, next)}
                    />
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void removeItem(line.variantId)}
                      disabled={isMutating}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="cart-line-price">
                  <strong>{formatMoney(line.lineTotal)}</strong>
                  {line.compareAtPrice && line.compareAtPrice.amount > line.unitPrice.amount ? (
                    <s className="muted">
                      {formatMoney({
                        amount: line.compareAtPrice.amount * line.quantity,
                        currency: line.compareAtPrice.currency,
                      })}
                    </s>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="cart-aside">
          <h2 className="cart-aside-title">Summary</h2>
          <CouponBox coupon={cart.coupon} />
          <OrderSummary totals={cart.totals} couponCode={cart.coupon?.code} />

          {cart.freeShippingShortfall ? (
            <p className="muted cart-ship-note">
              Spend {formatMoney(cart.freeShippingShortfall)} more for free delivery.
            </p>
          ) : null}

          <Link
            to="/checkout"
            className={`btn btn-primary btn-lg btn-block${
              cart.issues.length > 0 ? ' is-disabled' : ''
            }`}
            aria-disabled={cart.issues.length > 0}
            onClick={(event) => {
              // Checkout would reject this bag server-side anyway. Stopping it
              // here means the shopper fixes the problem on the page that shows
              // it, instead of filling in an address first.
              if (cart.issues.length > 0) event.preventDefault();
            }}
          >
            Checkout
          </Link>

          <Link to="/shop" className="btn btn-ghost btn-block">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
};
