import { Link } from 'react-router-dom';

export const NotFoundPage = () => (
  <div className="shell empty-state">
    <p className="eyebrow">404</p>
    <h1 className="section-title">We could not find that page</h1>
    <p className="muted">It may have moved, or the link may be out of date.</p>
    <Link to="/shop" className="btn btn-primary btn-lg">
      Back to the shop
    </Link>
  </div>
);
