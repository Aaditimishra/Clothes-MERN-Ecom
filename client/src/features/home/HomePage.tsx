import { Link } from 'react-router-dom';

import { ProductCard } from '../../components/ProductCard';
import { useNavigation } from '../../components/Header';
import { useListing } from '../../lib/catalog';
import { useSettings } from '../../lib/store-config';

/** One editorial tile per department, keyed to the seeded category slugs. */
const DEPARTMENT_TILES = [
  {
    slug: 'women',
    title: 'Women',
    copy: 'Linen, merino and silk — cut to be worn, not just photographed.',
    image:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1100&q=80',
  },
  {
    slug: 'men',
    title: 'Men',
    copy: 'Oxford shirts, selvedge denim and overshirts that outlast a season.',
    image:
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=1100&q=80',
  },
] as const;

/**
 * Used only until the settings request lands, and if a merchant clears the list.
 *
 * A hero that renders empty for 200ms on every cold load is worse than one that
 * renders the shipped copy and then updates.
 */
const FALLBACK_HERO = {
  eyebrow: 'Autumn / Winter',
  title: 'Clothes that earn their place.',
  copy: 'Natural fibres, honest cuts and a size guide you can actually trust.',
  image:
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=2000&q=80',
};

const ProductRail = ({
  title,
  subtitle,
  to,
  products,
  isLoading,
}: {
  title: string;
  subtitle: string;
  to: string;
  products: React.ComponentProps<typeof ProductCard>['product'][] | undefined;
  isLoading: boolean;
}) => (
  <section className="shell rail">
    <header className="rail-head">
      <div>
        <p className="eyebrow">{subtitle}</p>
        <h2 className="section-title">{title}</h2>
      </div>
      <Link to={to} className="btn btn-outline">
        View all
      </Link>
    </header>

    <div className="grid grid-4">
      {isLoading
        ? Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="card-skeleton">
              <div className="skeleton" style={{ aspectRatio: '3 / 4' }} />
              <div className="skeleton" style={{ height: 12, width: '40%' }} />
              <div className="skeleton" style={{ height: 14, width: '75%' }} />
            </div>
          ))
        : products?.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
    </div>
  </section>
);

export const HomePage = () => {
  const { data: navigation } = useNavigation();
  const settings = useSettings();
  const newIn = useListing({ sort: 'newest', pageSize: 4 });
  const onSale = useListing({ sort: 'discount', pageSize: 4 });
  const topRated = useListing({ sort: 'rating', pageSize: 8 });

  const collections = navigation?.flatMap((root) => root.children).slice(0, 6) ?? [];

  return (
    <>
      <section className="hero">
        <img
          className="hero-img"
          src={settings?.branding.heroUrl ?? FALLBACK_HERO.image}
          alt=""
          /* The hero is the largest contentful paint on the home page — it is
             the one image in the app worth fetching at high priority. */
          fetchPriority="high"
          decoding="async"
        />
        <div className="hero-body shell">
          <p className="eyebrow hero-eyebrow">
            {settings?.branding.heroEyebrow || FALLBACK_HERO.eyebrow}
          </p>
          <h1 className="hero-title">
            {settings?.branding.heroTitle || FALLBACK_HERO.title}
          </h1>
          <p className="hero-copy">
            {settings?.branding.heroCopy || FALLBACK_HERO.copy}
          </p>
          <div className="row hero-actions">
            <Link to="/shop?category=women" className="btn btn-accent btn-lg">
              Shop women
            </Link>
            <Link to="/shop?category=men" className="btn btn-outline btn-lg hero-btn-ghost">
              Shop men
            </Link>
          </div>
        </div>
      </section>

      {settings && settings.promises.length > 0 ? (
        <section className="shell promises">
          {settings.promises.map((promise) => (
            <div key={promise.title}>
              <strong>{promise.title}</strong>
              <span className="muted">{promise.copy}</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="shell departments">
        {DEPARTMENT_TILES.map((tile) => (
          <Link key={tile.slug} to={`/shop?category=${tile.slug}`} className="dept">
            <img src={tile.image} alt="" loading="lazy" decoding="async" />
            <div className="dept-body">
              <h2>{tile.title}</h2>
              <p>{tile.copy}</p>
              <span className="dept-cta">Shop {tile.title.toLowerCase()} →</span>
            </div>
          </Link>
        ))}
      </section>

      <ProductRail
        title="New this week"
        subtitle="Just landed"
        to="/shop?sort=newest"
        products={newIn.data?.items}
        isLoading={newIn.isLoading}
      />

      {collections.length > 0 ? (
        <section className="shell collections">
          <p className="eyebrow">Browse by category</p>
          <div className="chips">
            {collections.map((collection) => (
              <Link
                key={collection.id}
                to={`/shop?category=${collection.slug}`}
                className="chip chip-lg"
              >
                {collection.name}
                <span className="muted"> {collection.productCount}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <ProductRail
        title="Mid-season sale"
        subtitle="Up to 25% off"
        to="/shop?sort=discount"
        products={onSale.data?.items}
        isLoading={onSale.isLoading}
      />

      <section className="editorial">
        <div className="shell editorial-inner">
          <div>
            <p className="eyebrow">The fit promise</p>
            <h2 className="section-title">
              Every review tells you
              <br /> whether it runs small.
            </h2>
            <p className="muted editorial-copy">
              Most returns in clothing are about fit, not taste. So every review here
              carries a sizing note, and when enough people agree we say so plainly on
              the product page — before you buy, not after.
            </p>
            <Link to="/shop?sort=rating" className="btn btn-primary">
              Shop best rated
            </Link>
          </div>
          <img
            src="https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&w=1200&q=80"
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
      </section>

      <ProductRail
        title="Best rated"
        subtitle="Loved by shoppers"
        to="/shop?sort=rating"
        products={topRated.data?.items}
        isLoading={topRated.isLoading}
      />
    </>
  );
};
