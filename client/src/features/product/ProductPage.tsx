import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatMoney, sizeRank, type Size } from '@shop/shared';

import { Price } from '../../components/Price';
import { ProductCard } from '../../components/ProductCard';
import { Rating } from '../../components/Rating';
import { WishlistButton } from '../../components/WishlistButton';
import { useProduct, useRelated } from '../../lib/catalog';
import { useCart } from '../../store/cart';
import { NotFoundPage } from '../NotFoundPage';
import { Reviews } from './Reviews';
import { SizeGuideDialog } from './SizeGuideDialog';

/** Below this, the page says how few are left — above it, saying so is a gimmick. */
const LOW_STOCK_THRESHOLD = 5;

export const ProductPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, isError } = useProduct(slug);
  const { data: related } = useRelated(slug);
  const { addItem, isMutating } = useCart();

  const [colour, setColour] = useState<string | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const [showSizeError, setShowSizeError] = useState(false);

  // Falls back to the first colourway until the shopper picks one, so the page
  // always has a gallery to render on first paint.
  const activeColour = colour ?? product?.colourways[0]?.code ?? null;

  const gallery = useMemo(
    () =>
      product?.colourways.find((entry) => entry.code === activeColour)?.images ??
      product?.colourways[0]?.images ??
      [],
    [product, activeColour],
  );

  /**
   * Sizes for the selected colour, in size order, each carrying its own stock.
   *
   * Out-of-stock sizes are listed and struck through rather than hidden. A
   * shopper who cannot find their size needs to know it exists and has sold out
   * — hiding it reads as "this shop does not make an XL".
   */
  const sizeOptions = useMemo(() => {
    if (!product || !activeColour) return [];

    return product.variants
      .filter((variant) => variant.colour === activeColour)
      .sort((left, right) => sizeRank(left.size) - sizeRank(right.size));
  }, [product, activeColour]);

  const selected = sizeOptions.find((variant) => variant.size === size) ?? null;

  if (isLoading) {
    return (
      <div className="shell product">
        <div className="product-gallery">
          <div className="skeleton" style={{ aspectRatio: '3 / 4' }} />
        </div>
        <div className="product-info stack">
          <div className="skeleton" style={{ height: 16, width: '30%' }} />
          <div className="skeleton" style={{ height: 32, width: '80%' }} />
          <div className="skeleton" style={{ height: 20, width: '40%' }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      </div>
    );
  }

  if (isError || !product) return <NotFoundPage />;

  const handleAdd = async () => {
    if (!selected) {
      setShowSizeError(true);
      return;
    }
    setShowSizeError(false);
    await addItem(selected.id, 1);
  };

  return (
    <>
      <div className="shell product">
        <nav className="crumbs product-crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          {product.breadcrumbs.map((crumb) => (
            <span key={crumb.slug}>
              <span aria-hidden="true"> / </span>
              <Link to={`/shop?category=${crumb.slug}`}>{crumb.name}</Link>
            </span>
          ))}
        </nav>

        <div className="product-gallery">
          <div className="product-thumbs">
            {gallery.map((image, index) => (
              <button
                key={image.url}
                type="button"
                className={`product-thumb${index === imageIndex ? ' is-active' : ''}`}
                onClick={() => setImageIndex(index)}
                aria-label={`View image ${index + 1}`}
              >
                <img src={image.url} alt="" width={72} height={96} loading="lazy" />
              </button>
            ))}
          </div>

          <div className="product-hero">
            {gallery[imageIndex] ? (
              <img
                src={gallery[imageIndex].url}
                /* Alt text is written per image in the admin, so it describes the
                   photograph rather than restating the product name. */
                alt={gallery[imageIndex].alt || product.name}
                width={900}
                height={1200}
                fetchPriority="high"
              />
            ) : (
              <div className="card-media-empty" />
            )}
            <WishlistButton productId={product.id} className="product-wish" />
          </div>
        </div>

        <div className="product-info">
          <p className="product-brand">{product.brand}</p>
          <h1 className="product-name">{product.name}</h1>

          {product.reviewCount > 0 ? (
            <a href="#reviews" className="product-rating-link">
              <Rating value={product.rating} count={product.reviewCount} size={15} />
            </a>
          ) : null}

          <Price
            price={product.fromPrice}
            compareAt={product.compareAtPrice}
            discountPercent={product.discountPercent}
            size="lg"
          />
          <p className="muted product-tax-note">Inclusive of all taxes</p>

          {product.colourways.length > 0 ? (
            <div className="product-option">
              <div className="product-option-head">
                <span className="field-label">
                  Colour:{' '}
                  <strong>
                    {product.colourways.find((entry) => entry.code === activeColour)?.label}
                  </strong>
                </span>
              </div>
              <div className="row product-swatches">
                {product.colourways.map((colourway) => (
                  <button
                    key={colourway.code}
                    type="button"
                    className={`swatch swatch-lg${
                      activeColour === colourway.code ? ' is-active' : ''
                    }`}
                    style={{ '--swatch': colourway.swatch } as React.CSSProperties}
                    onClick={() => {
                      setColour(colourway.code);
                      // The gallery changes with the colour, so an index from the
                      // previous colourway would point at nothing.
                      setImageIndex(0);
                      setSize(null);
                    }}
                    aria-pressed={activeColour === colourway.code}
                    aria-label={colourway.label}
                    title={colourway.label}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="product-option">
            <div className="product-option-head">
              <span className="field-label">Size</span>
              {product.sizeChart ? (
                <button type="button" className="link-btn" onClick={() => setGuideOpen(true)}>
                  Size guide
                </button>
              ) : null}
            </div>

            <div className="size-grid">
              {sizeOptions.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  className={`size-btn${size === variant.size ? ' is-active' : ''}${
                    variant.isAvailable ? '' : ' is-out'
                  }`}
                  onClick={() => {
                    setSize(variant.size);
                    setShowSizeError(false);
                  }}
                  disabled={!variant.isAvailable}
                  aria-pressed={size === variant.size}
                  title={variant.isAvailable ? undefined : 'Sold out'}
                >
                  {variant.size.toUpperCase()}
                </button>
              ))}
            </div>

            {showSizeError ? (
              <p className="field-error" role="alert">
                Please choose a size
              </p>
            ) : null}

            {selected && selected.stockQuantity <= LOW_STOCK_THRESHOLD ? (
              <p className="low-stock">Only {selected.stockQuantity} left in this size</p>
            ) : null}
          </div>

          <div className="product-actions">
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={() => void handleAdd()}
              disabled={isMutating || !product.isAvailable}
            >
              {!product.isAvailable
                ? 'Sold out'
                : isMutating
                  ? 'Adding…'
                  : selected
                    ? `Add to bag · ${formatMoney(selected.price)}`
                    : 'Add to bag'}
            </button>
          </div>

          <ul className="product-promises">
            <li>Free delivery over ₹1,499</li>
            <li>15-day returns, tags on</li>
            <li>Dispatched within 24 hours</li>
          </ul>

          <div className="product-details">
            <details open>
              <summary>Description</summary>
              <div className="details-body">
                <p>{product.description}</p>
                {product.highlights.length > 0 ? (
                  <ul className="highlights">
                    {product.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>

            {product.specs.length > 0 ? (
              <details>
                <summary>Details & fabric</summary>
                <div className="details-body">
                  <dl className="specs">
                    {product.specs.map((spec) => (
                      <div key={spec.label}>
                        <dt>{spec.label}</dt>
                        <dd>{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </details>
            ) : null}

            {product.careInstructions ? (
              <details>
                <summary>Care</summary>
                <div className="details-body">
                  <p>{product.careInstructions}</p>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>

      <div className="shell">
        <Reviews productId={product.id} />
      </div>

      {related && related.length > 0 ? (
        <section className="shell rail">
          <header className="rail-head">
            <h2 className="section-title">You may also like</h2>
          </header>
          <div className="grid grid-4">
            {related.slice(0, 4).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      {isGuideOpen && product.sizeChart ? (
        <SizeGuideDialog chart={product.sizeChart} onClose={() => setGuideOpen(false)} />
      ) : null}
    </>
  );
};
