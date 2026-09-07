import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { CategoryTreeNode } from '@shop/shared';

import { request } from '../lib/api';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';
import { useTheme } from '../store/theme';
import { useSettings } from '../lib/store-config';

export const useNavigation = () =>
  useQuery({
    queryKey: ['navigation'],
    queryFn: () => request<CategoryTreeNode[]>('/catalog/navigation'),
    // The menu changes when a merchant edits it, which is rarely. Refetching it
    // on every route change would be a request per page for data that is stable.
    staleTime: 10 * 60 * 1000,
  });

export const Header = () => {
  const { data: navigation } = useNavigation();
  const { itemCount, openDrawer } = useCart();
  const { customer } = useAuth();
  const { theme, toggle } = useTheme();
  const settings = useSettings();
  const navigate = useNavigate();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const [term, setTerm] = useState('');
  const headerRef = useRef<HTMLElement>(null);

  /**
   * Closes the mega menu on Escape and on any click outside it.
   *
   * A menu that only closes when you hover away strands keyboard users with it
   * open over the page, and traps touch users entirely — a tap outside is how
   * everyone expects to dismiss an overlay.
   */
  useEffect(() => {
    if (!openMenu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openMenu]);

  // Any navigation dismisses both menus, so the shopper never lands on a new
  // page with the previous page's menu still hanging open.
  const closeAll = () => {
    setOpenMenu(null);
    setMobileOpen(false);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) return;
    navigate(`/shop?search=${encodeURIComponent(query)}`);
    closeAll();
  };

  return (
    <>
      {/* An empty promo bar in settings hides the strip entirely rather than
          rendering an empty band of colour above the header. */}
      {settings?.promoBar ? <div className="promo-bar">{settings.promoBar}</div> : null}

      <header className="header" ref={headerRef}>
        <div className="header-inner shell">
          <button
            type="button"
            className="header-burger"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Menu"
            aria-expanded={isMobileOpen}
          >
            <span />
            <span />
            <span />
          </button>

          <Link to="/" className="logo" onClick={closeAll}>
            {settings?.branding.logoUrl ? (
              <img
                src={settings.branding.logoUrl}
                alt={settings.storeName}
                style={{ height: 26, width: 'auto' }}
              />
            ) : (
              (settings?.storeName ?? 'Threadline')
            )}
          </Link>

          <nav className="header-nav" aria-label="Main">
            {navigation?.map((root) => (
              <div
                key={root.id}
                className="header-nav-item"
                onMouseEnter={() => setOpenMenu(root.id)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <NavLink
                  to={`/shop?category=${root.slug}`}
                  className="header-nav-link"
                  onFocus={() => setOpenMenu(root.id)}
                  aria-expanded={openMenu === root.id}
                  aria-haspopup={root.children.length > 0}
                >
                  {root.name}
                </NavLink>

                {root.children.length > 0 && openMenu === root.id ? (
                  <div className="mega">
                    <div className="mega-inner shell">
                      <div className="mega-links">
                        <p className="eyebrow">Shop {root.name}</p>
                        <ul>
                          {root.children.map((child) => (
                            <li key={child.id}>
                              <Link to={`/shop?category=${child.slug}`} onClick={closeAll}>
                                {child.name}
                                <span className="muted"> ({child.productCount})</span>
                              </Link>
                            </li>
                          ))}
                          <li>
                            <Link
                              to={`/shop?category=${root.slug}`}
                              className="mega-all"
                              onClick={closeAll}
                            >
                              View everything →
                            </Link>
                          </li>
                        </ul>
                      </div>

                      <div className="mega-links">
                        <p className="eyebrow">Shop by fabric</p>
                        <ul>
                          {['linen', 'cotton', 'wool', 'silk', 'denim'].map((fabric) => (
                            <li key={fabric}>
                              <Link
                                to={`/shop?category=${root.slug}&fabric=${fabric}`}
                                onClick={closeAll}
                              >
                                {fabric.charAt(0).toUpperCase() + fabric.slice(1)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <Link
                        to={`/shop?category=${root.slug}&sort=discount`}
                        className="mega-promo"
                        onClick={closeAll}
                      >
                        <span className="eyebrow">Mid-season</span>
                        <strong>Up to 25% off</strong>
                        <span className="muted">Shop the edit →</span>
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            <NavLink to="/shop?sort=newest" className="header-nav-link">
              New in
            </NavLink>
            <NavLink to="/shop?sort=discount" className="header-nav-link header-nav-sale">
              Sale
            </NavLink>
            <NavLink to="/journal" className="header-nav-link">
              Journal
            </NavLink>
          </nav>

          <div className="header-actions">
            <form className="search" role="search" onSubmit={submitSearch}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search shirts, dresses…"
                aria-label="Search products"
              />
            </form>

            <button
              type="button"
              className="icon-btn"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>

            <Link
              to={customer ? '/account' : '/sign-in'}
              className="icon-btn"
              aria-label={customer ? 'Your account' : 'Sign in'}
              title={customer ? `Hi, ${customer.firstName}` : 'Sign in'}
            >
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                <circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M4.8 20a7.4 7.4 0 0 1 14.4 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </Link>

            <button
              type="button"
              className="icon-btn bag-btn"
              onClick={openDrawer}
              aria-label={`Bag, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
            >
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                <path
                  d="M5.5 7.5h13l-1 12.5h-11z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 9.5v-2a3 3 0 0 1 6 0v2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {itemCount > 0 ? <span className="bag-count">{itemCount}</span> : null}
            </button>
          </div>
        </div>

        {isMobileOpen ? (
          <nav className="mobile-nav" aria-label="Mobile">
            {navigation?.map((root) => (
              <details key={root.id}>
                <summary>{root.name}</summary>
                <ul>
                  {root.children.map((child) => (
                    <li key={child.id}>
                      <Link to={`/shop?category=${child.slug}`} onClick={closeAll}>
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <Link to="/shop?sort=newest" onClick={closeAll}>New in</Link>
            <Link to="/shop?sort=discount" onClick={closeAll}>Sale</Link>
            <Link to="/journal" onClick={closeAll}>Journal</Link>
            <Link to="/wishlist" onClick={closeAll}>Wishlist</Link>
          </nav>
        ) : null}
      </header>
    </>
  );
};
