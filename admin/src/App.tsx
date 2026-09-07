import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { RequirePermission } from './components/RequirePermission';
import { Sidebar } from './components/Sidebar';
import { api } from './lib/api';
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
const RAIL_KEY = 'threadline.admin.rail';

const Shell = () => {
  const [isNavOpen, setNavOpen] = useState(false);
  /**
   * The rail is remembered, because it is a working preference rather than a
   * mood: somebody who collapsed the menu to read a wide stock table wants it
   * collapsed tomorrow too, and re-collapsing it every morning is the kind of
   * small tax that makes a tool feel unfinished.
   */
  const [isRail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const { pathname } = useLocation();

  const toggleRail = () => {
    setRail((rail) => {
      try {
        localStorage.setItem(RAIL_KEY, rail ? '0' : '1');
      } catch {
        // Not worth surfacing — the rail still toggles for this session.
      }
      return !rail;
    });
  };

  const { data: notifications } = useNotifications();

  /**
   * The payments badge, from the same queue the screen itself reads.
   *
   * A count is the difference between somebody opening Payments because they
   * remembered to and opening it because a shopper is waiting. Sixty seconds is
   * often enough for that, and cheap enough not to think about.
   */
  const { data: paymentQueue } = useQuery({
    queryKey: ['payment-queue'],
    queryFn: () => api<{ total: number }>('/payments?pageSize=1&paymentStatus=verifying'),
    refetchInterval: 60_000,
  });

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
    <div className={`shell${isRail ? ' is-rail' : ''}`}>
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

      <Sidebar
        isOpen={isNavOpen}
        isRail={isRail}
        onToggleRail={toggleRail}
        onNavigate={() => setNavOpen(false)}
        badges={{
          notifications: notifications?.unread ?? 0,
          payments: paymentQueue?.total ?? 0,
        }}
      />

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
