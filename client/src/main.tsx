import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { ApiRequestError } from './lib/api';
import { AuthProvider } from './store/auth';
import { CartProvider } from './store/cart';
import { ThemeProvider } from './store/theme';
import { ToastProvider } from './store/toast';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Never retry a 4xx.
       *
       * A 404 for a product slug that does not exist will still be a 404 three
       * attempts later — all retrying achieves is making the "not found" page
       * take two seconds to appear. Server and network errors are worth one
       * more try.
       */
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
