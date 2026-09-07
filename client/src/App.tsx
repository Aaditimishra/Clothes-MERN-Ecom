import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { ThemeBridge } from './components/ThemeBridge';
import { Toasts } from './components/Toasts';
import { AccountPage } from './features/account/AccountPage';
import { CartPage } from './features/cart/CartPage';
import { ContentPage } from './features/content/ContentPage';
import { JournalPage } from './features/content/JournalPage';
import { PostPage } from './features/content/PostPage';
import { ResetPasswordPage } from './features/account/ResetPasswordPage';
import { CheckoutPage } from './features/checkout/CheckoutPage';
import { HomePage } from './features/home/HomePage';
import { ListingPage } from './features/listing/ListingPage';
import { NotFoundPage } from './features/NotFoundPage';
import { OrderConfirmationPage } from './features/checkout/OrderConfirmationPage';
import { ProductPage } from './features/product/ProductPage';
import { SignInPage } from './features/account/SignInPage';
import { WishlistPage } from './features/account/WishlistPage';

/**
 * Restores the scroll position on navigation.
 *
 * A single-page app keeps the scroll offset between routes by default, so
 * clicking a product from halfway down a listing opens its page already scrolled
 * past the images. The listing page opts out via its own key, because changing a
 * filter should not throw the shopper back to the top.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
};

export const App = () => (
  <>
    <a className="skip-link" href="#main">
      Skip to content
    </a>
    <ScrollToTop />
    <ThemeBridge />
    <Header />

    <main id="main">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/shop" element={<ListingPage />} />
        <Route path="/product/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order/:reference" element={<OrderConfirmationPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/page/:slug" element={<ContentPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/journal/:slug" element={<PostPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>

    <Footer />
    <CartDrawer />
    <Toasts />
  </>
);
