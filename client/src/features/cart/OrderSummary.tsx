import { formatMoney, type CartTotals } from '@shop/shared';

interface OrderSummaryProps {
  totals: CartTotals;
  couponCode?: string | null;
}

/**
 * The money, itemised.
 *
 * Every line the shopper is charged appears here, and GST is shown as INCLUDED
 * rather than added — apparel is priced tax-inclusive in India, so listing it as
 * a separate addition would imply the total is about to go up.
 */
export const OrderSummary = ({ totals, couponCode }: OrderSummaryProps) => (
  <dl className="summary">
    <div>
      <dt>Bag total (MRP)</dt>
      <dd>{formatMoney(totals.mrpTotal)}</dd>
    </div>

    {totals.savings.amount > 0 ? (
      <div className="summary-saving">
        <dt>Discount on MRP</dt>
        <dd>−{formatMoney(totals.savings)}</dd>
      </div>
    ) : null}

    {totals.couponDiscount.amount > 0 ? (
      <div className="summary-saving">
        <dt>Coupon{couponCode ? ` (${couponCode})` : ''}</dt>
        <dd>−{formatMoney(totals.couponDiscount)}</dd>
      </div>
    ) : null}

    <div>
      <dt>Delivery</dt>
      <dd>{totals.shipping.amount === 0 ? 'Free' : formatMoney(totals.shipping)}</dd>
    </div>

    <div className="summary-total">
      <dt>Total</dt>
      <dd>{formatMoney(totals.grandTotal)}</dd>
    </div>

    <div className="summary-tax">
      <dt>Includes GST</dt>
      <dd>{formatMoney(totals.taxIncluded)}</dd>
    </div>
  </dl>
);
