import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProductSummaryView } from '@shop/shared';

import { Price } from './Price';
import { Rating } from './Rating';
import { WishlistButton } from './WishlistButton';

interface ProductCardProps {
  product: ProductSummaryView;
  /** Above-the-fold cards load eagerly; the rest wait until they scroll near. */
  priority?: boolean;
}

export const ProductCard = ({ product, priority = false }: ProductCardProps) => {
  const [activeColour, setActiveColour] = useState(product.colours[0]?.code ?? null);

  return (
    <article className={`card${product.isAvailable ? '' : ' card-sold-out'}`}>
      <div className="card-media">
        <Link to={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              /* Empty on purpose: the card's link already carries the product
                 name, so repeating it here makes a screen reader say it twice. */
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              /* Reserving the aspect ratio stops the grid reflowing as images
                 arrive — the cause of a mis-click on a listing page. */
              width={600}
              height={800}
              decoding="async"
            />
          ) : (
            <div className="card-media-empty" />
          )}
        </Link>

        <div className="card-badges">
          {product.discountPercent ? (
            <span className="badge badge-sale">{product.discountPercent}% off</span>
          ) : null}
          {product.isNew && !product.discountPercent ? (
            <span className="badge">New in</span>
          ) : null}
          {!product.isAvailable ? <span className="badge badge-muted">Sold out</span> : null}
        </div>

        <WishlistButton productId={product.id} className="card-wish" />

        {product.sizesInStock.length > 0 ? (
          <div className="card-sizes" aria-hidden="true">
            {product.sizesInStock.map((size) => (
              <span key={size}>{size.toUpperCase()}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card-body">
        <p className="card-brand">{product.brand}</p>
        <h3 className="card-name">
          {/* The whole card is clickable via this link's ::after overlay, so the
              accessible name stays the product name rather than "read more". */}
          <Link to={`/product/${product.slug}`} className="card-link">
            {product.name}
          </Link>
        </h3>

        <Price
          price={product.fromPrice}
          compareAt={product.compareAtPrice}
          discountPercent={product.discountPercent}
          size="sm"
        />

        {product.reviewCount > 0 ? (
          <Rating value={product.rating} count={product.reviewCount} size={12} />
        ) : null}

        {product.colours.length > 1 ? (
          <div className="card-swatches">
            {product.colours.slice(0, 5).map((colour) => (
              <button
                key={colour.code}
                type="button"
                className={`swatch swatch-xs${activeColour === colour.code ? ' is-active' : ''}`}
                style={{ '--swatch': colour.swatch } as React.CSSProperties}
                onClick={() => setActiveColour(colour.code)}
                aria-label={colour.label}
                title={colour.label}
              />
            ))}
            {product.colours.length > 5 ? (
              <span className="card-swatch-more">+{product.colours.length - 5}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
};
