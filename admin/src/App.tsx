import { Fragment, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { RequirePermission } from './components/RequirePermission';
import { useSession } from './lib/session';
import { CategoriesPage } from './pages/CategoriesPage';
import { CouponsPage } from './pages/CouponsPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { EmailsPage } from './pages/EmailsPage';
import { MediaPage } from './pages/MediaPage';
import { NotificationsPage, useNotifications } from './pages/NotificationsPage';
import { OrdersPage } from './pages/OrdersPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ProductEditorPage } from './pages/ProductEditorPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReviewsPage } from './pages/ReviewsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ContentPage } from './pages/ContentPage';
import { SizeChartsPage } from './pages/SizeChartsPage';
import { StaffPage } from './pages/StaffPage';
import { TaxonomyPage } from './pages/TaxonomyPage';

interface NavEntry {
  to: string;
  label: string;
  permission: string;
  group: string;
}

/**
 * The menu is derived from permissions, so a merchandiser never sees a Settings
 * link that would 403 on click. Hiding beats disabling here: a greyed-out link
 * still tells someone the feature exists and invites a support ticket.
 */
const NAV: NavEntry[] = [
  { to: '/', label: 'Dashboard', permission: 'order.view', group: 'Overview' },
  // No permission gate: the feed itself is filtered, so everyone sees their own.
  { to: '/notifications', label: 'Notifications', permission: '*', group: 'Overview' },
  { to: '/products', label: 'Products', permission: 'catalog.view', group: 'Catalogue' },
  { to: '/categories', label: 'Categories', permission: 'catalog.view', group: 'Catalogue' },
  { to: '/taxonomy', label: 'Attributes', permission: 'catalog.view', group: 'Catalogue' },
  { to: '/size-charts', label: 'Size charts', permission: 'catalog.view', group: 'Catalogue' },
  { to: '/media', label: 'Media', permission: 'catalog.view', group: 'Catalogue' },
  { to: '/content', label: 'Journal & pages', permission: 'catalog.view', group: 'Catalogue' },
  { to: '/orders', label: 'Orders', permission: 'order.view', group: 'Sales' },
  { to: '/payments', label: 'Payments', permission: 'order.view', group: 'Sales' },
  { to: '/customers', label: 'Customers', permission: 'customer.view', group: 'Sales' },
  { to: '/coupons', label: 'Coupons', permission: 'promotion.manage', group: 'Sales' },
  { to: '/reviews', label: 'Reviews', permission: 'review.moderate', group: 'Sales' },
  { to: '/settings', label: 'Store settings', permission: 'settings.manage', group: 'Configure' },
  { to: '/staff', label: 'Staff', permission: 'staff.manage', group: 'Configure' },
  { to: '/emails', label: 'Emails', permission: 'settings.manage', group: 'Configure' },
];

const Sidebar = ({ isOpen, onNavigate }: { isOpen: boolean; onNavigate: () => void }) => {
  const { session, signOut, can } = useSession();
  const visible = NAV.filter((entry) => entry.permission === '*' || can(entry.permission));
  const { data: notifications } = useNotifications();

  let lastGroup = '';

  return (
    <aside className={`sidebar${isOpen ? ' is-open' : ''}`} onClick={onNavigate}>
      <div className="sidebar-brand">
        <strong>Threadline</strong>
        <span>Admin</span>
      </div>

      <nav className="nav">
        {visible.map((entry) => {
          const heading = entry.group !== lastGroup ? entry.group : null;
          lastGroup = entry.group;

          return (
            <Fragment key={entry.to}>
              {heading ? <p className="nav-group">{heading}</p> : null}
              <NavLink to={entry.to} end={entry.to === '/'}>
                {entry.label}
                {entry.to === '/notifications' && notifications && notifications.unread > 0 ? (
                  <span className="nav-badge">{notifications.unread}</span>
                ) : null}
              </NavLink>
            </Fragment>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <NavLink to="/profile" className="sidebar-user">
          <strong>{session?.staff.name}</strong>
          <span>{session?.staff.role} · view profile</span>
        </NavLink>
        <button type="button" className="btn btn-sm" onClick={signOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
};

export const App = () => {
  const { session, isReady } = useSession();

  // Waiting for the token check before deciding. Without this a hard refresh
  // flashes the login screen at someone who is already signed in.
  if (!isReady) {
    return (
      <div className="login">
        <div className="skeleton" style={{ width: 380, height: 260 }} />
      </div>
    );
  }

  if (!session) return <LoginPage />;

  return <Shell />;
};

/**
 * The signed-in frame.
 *
 * Below 900px the sidebar becomes an off-canvas drawer instead of stacking above
 * the content — as a static column it pushed the first row of every table 700px
 * down an 844px screen, so a merchant scrolled past the whole menu before seeing
 * anything they came for.
 */
const Shell = () => {
  const [isNavOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Any navigation closes the drawer, so nobody lands on a new page with the
  // previous page's menu still over it.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Escape closes it, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!isNavOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isNavOpen]);

  return (
    <div className="shell">
      <div className="mobile-bar">
        <button
          type="button"
          className="mobile-burger"
          onClick={() => setNavOpen((open) => !open)}
          aria-label="Menu"
          aria-expanded={isNavOpen}
        >
          <span />
          <span />
          <span />
        </button>
        <strong>Threadline</strong>
        <span className="muted">Admin</span>
      </div>

      <Sidebar isOpen={isNavOpen} onNavigate={() => setNavOpen(false)} />

      {isNavOpen ? (
        <div className="sidebar-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      ) : null}

      <div className="main">
        <Routes>
          <Route
            path="/"
            element={
              <RequirePermission permission="order.view">
                <DashboardPage />
              </RequirePermission>
            }
          />
          <Route
            path="/products"
            element={
              <RequirePermission permission="catalog.view">
                <ProductsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/products/new"
            element={
              <RequirePermission permission="catalog.manage">
                <ProductEditorPage />
              </RequirePermission>
            }
          />
          <Route
            path="/products/:id"
            element={
              <RequirePermission permission="catalog.view">
                <ProductEditorPage />
              </RequirePermission>
            }
          />
          <Route
            path="/categories"
            element={
              <RequirePermission permission="catalog.view">
                <CategoriesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/taxonomy"
            element={
              <RequirePermission permission="catalog.view">
                <TaxonomyPage />
              </RequirePermission>
            }
          />
          <Route
            path="/size-charts"
            element={
              <RequirePermission permission="catalog.view">
                <SizeChartsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/content"
            element={
              <RequirePermission permission="catalog.view">
                <ContentPage />
              </RequirePermission>
            }
          />
          <Route
            path="/media"
            element={
              <RequirePermission permission="catalog.view">
                <MediaPage />
              </RequirePermission>
            }
          />
          <Route
            path="/orders"
            element={
              <RequirePermission permission="order.view">
                <OrdersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/payments"
            element={
              <RequirePermission permission="order.view">
                <PaymentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/customers"
            element={
              <RequirePermission permission="customer.view">
                <CustomersPage />
              </RequirePermission>
            }
          />
          <Route
            path="/coupons"
            element={
              <RequirePermission permission="promotion.manage">
                <CouponsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/reviews"
            element={
              <RequirePermission permission="review.moderate">
                <ReviewsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/settings"
            element={
              <RequirePermission permission="settings.manage">
                <SettingsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/staff"
            element={
              <RequirePermission permission="staff.manage">
                <StaffPage />
              </RequirePermission>
            }
          />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route
            path="/emails"
            element={
              <RequirePermission permission="settings.manage">
                <EmailsPage />
              </RequirePermission>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
};
