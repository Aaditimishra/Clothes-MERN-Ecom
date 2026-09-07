import { Link, Navigate } from 'react-router-dom';

import { ProductCard } from '../../components/ProductCard';
import { useWishlist } from '../../components/WishlistButton';
import { useAuth } from '../../store/auth';

export const WishlistPage = () => {
  const { customer, isReady } = useAuth();
  const { data, isLoading } = useWishlist();

  if (!isReady) {
    return (
      <div className="shell page">
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  if (!customer) return <Navigate to="/sign-in" state={{ from: '/wishlist' }} replace />;

  return (
    <div className="shell page">
      <h1 className="section-title">Your wishlist</h1>

      {isLoading ? (
        <div className="grid grid-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="card-skeleton">
              <div className="skeleton" style={{ aspectRatio: '3 / 4' }} />
            </div>
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid grid-4">
          {data.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p className="muted">Nothing saved yet. Tap the heart on anything you like.</p>
          <Link to="/shop" className="btn btn-primary btn-lg">
            Browse the shop
          </Link>
        </div>
      )}
    </div>
  );
};
