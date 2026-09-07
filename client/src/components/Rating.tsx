interface RatingProps {
  value: number | null;
  count?: number;
  size?: number;
}

/**
 * A star rating drawn with a clipped overlay rather than five separate icons.
 *
 * One gradient fill means 4.3 stars renders as 4.3 stars, not as "round to 4"
 * or "show half a star". The `aria-label` carries the real number, because the
 * visual is decorative to a screen reader.
 */
export const Rating = ({ value, count, size = 14 }: RatingProps) => {
  if (value === null) {
    return <span className="rating rating-empty muted">No reviews yet</span>;
  }

  const percent = Math.max(0, Math.min(100, (value / 5) * 100));

  return (
    <span className="rating" aria-label={`Rated ${value} out of 5`}>
      <span className="rating-stars" style={{ fontSize: `${size}px` }} aria-hidden="true">
        <span className="rating-stars-base">★★★★★</span>
        <span className="rating-stars-fill" style={{ width: `${percent}%` }}>
          ★★★★★
        </span>
      </span>
      <span className="rating-value">{value.toFixed(1)}</span>
      {typeof count === 'number' && count > 0 ? (
        <span className="rating-count muted">({count})</span>
      ) : null}
    </span>
  );
};
