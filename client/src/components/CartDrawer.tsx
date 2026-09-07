import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '@shop/shared';

import { useCart } from '../store/cart';
import { QuantityStepper } from './QuantityStepper';

export const CartDrawer = () => {
  const { cart, isDrawerOpen, closeDrawer, setQuantity, removeItem, isMutating } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * While the drawer is open: Escape closes it, and the page behind does not
   * scroll.
   *
   * Without the scroll lock, flicking the drawer on a phone scrolls the listing
   * underneath and the shopper loses their place in the grid they were browsing.
   */
  useEffect(() => {
    if (!isDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isDrawerOpen, closeDrawer]);

  if (!isDrawerOpen) return null;

  const lines = cart?.lines ?? [];
  const shortfall = cart?.freeShippingShortfall ?? null;

  return (
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={closeDrawer} aria-hidden="true" />

      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="drawer-head">
          <h2>Your bag {cart?.itemCount ? `(${cart.itemCount})` : ''}</h2>
          <button type="button" onClick={closeDrawer} className="icon-btn" aria-label="Close bag">
            ×
          </button>
        </header>

        {shortfall ? (
          <p className="drawer-ship">
            Spend <strong>{formatMoney(shortfall)}</strong> more for free delivery
          </p>
        ) : lines.length > 0 ? (
          <p className="drawer-ship drawer-ship-earned">You have earned free delivery</p>
        ) : null}

        {lines.length === 0 ? (
          <div className="drawer-empty">
            <p>Your bag is empty.</p>
            <Link to="/shop" className="btn btn-primary" onClick={closeDrawer}>
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            <ul className="drawer-lines">
              {lines.map((line) => (
                <li key={line.variantId} className={line.isAvailable ? '' : 'is-unavailable'}>
                  <Link to={`/product/${line.productSlug}`} onClick={closeDrawer}>
                    {line.imageUrl ? (
                      <img src={line.imageUrl} alt="" width={72} height={96} loading="lazy" />
                    ) : (
                      <div className="drawer-line-noimg" />
                    )}
                  </Link>

                  <div className="drawer-line-body">
                    <p className="drawer-line-brand">{line.brand}</p>
                    <Link
                      to={`/product/${line.productSlug}`}
                      className="drawer-line-name"
                      onClick={closeDrawer}
                    >
                      {line.name}
                    </Link>
                    <p className="muted drawer-line-variant">
                      {line.size.toUpperCase()} · {line.colourLabel}
                    </p>

                    <div className="drawer-line-foot">
                      <QuantityStepper
                        value={line.quantity}
                        max={Math.max(1, line.available)}
                        disabled={isMutating}
                        onChange={(next) => void setQuantity(line.variantId, next)}
                      />
                      <strong>{formatMoney(line.lineTotal)}</strong>
                    </div>

                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void removeItem(line.variantId)}
                      disabled={isMutating}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {cart?.issues.length ? (
              <ul className="drawer-issues">
                {cart.issues.map((issue) => (
                  <li key={issue.variantId}>{issue.message}</li>
                ))}
              </ul>
            ) : null}

            <footer className="drawer-foot">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>Subtotal</span>
                <strong>{cart ? formatMoney(cart.totals.subtotal) : '—'}</strong>
              </div>
              {cart && cart.totals.savings.amount > 0 ? (
                <div className="row drawer-savings" style={{ justifyContent: 'space-between' }}>
                  <span>You save</span>
                  <span>{formatMoney(cart.totals.savings)}</span>
                </div>
              ) : null}
              <p className="muted drawer-foot-note">
                Delivery and taxes are shown at checkout.
              </p>

              <Link to="/cart" className="btn btn-outline btn-block" onClick={closeDrawer}>
                View bag
              </Link>
              <Link
                to="/checkout"
                className="btn btn-primary btn-block btn-lg"
                onClick={closeDrawer}
              >
                Checkout
              </Link>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
};
