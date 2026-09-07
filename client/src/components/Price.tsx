import { formatMoney, type Money } from '@shop/shared';

interface PriceProps {
  price: Money | null;
  compareAt?: Money | null;
  discountPercent?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Price, struck-through MRP and the discount, as one unit.
 *
 * Kept together because they are only ever correct together: a compare-at price
 * with no discount label reads as an error, and a discount with no reference
 * price is unverifiable. The component simply omits the extras when there is no
 * discount.
 */
export const Price = ({ price, compareAt, discountPercent, size = 'md' }: PriceProps) => {
  if (!price) return <span className="muted">Unavailable</span>;

  const hasDiscount = Boolean(compareAt && compareAt.amount > price.amount);

  return (
    <span className={`price price-${size}`}>
      <span className="price-now">{formatMoney(price)}</span>
      {hasDiscount && compareAt ? (
        <>
          <s className="price-was">{formatMoney(compareAt)}</s>
          {discountPercent ? <span className="price-off">{discountPercent}% off</span> : null}
        </>
      ) : null}
    </span>
  );
};
