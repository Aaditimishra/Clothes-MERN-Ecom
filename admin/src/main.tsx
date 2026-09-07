import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AdminError } from './lib/api';
import { SessionProvider } from './lib/session';
import { applyTheme, readTheme } from './lib/theme';
import { ToastProvider } from './lib/toast';
import './styles/admin.css';

/**
 * Applied before React mounts.
 *
 * Doing it in an effect paints the default theme for a frame first, which on a
 * dark machine is a white flash in a dark room — small, and the kind of thing
 * people notice every single time they open the panel.
 */
applyTheme(readTheme());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a 401 or a 403 cannot succeed; retrying a 404 finds the same
      // nothing. Only server and network faults are worth a second attempt.
      retry: (failureCount, error) =>
        error instanceof AdminError && error.status < 500 ? false : failureCount < 2,
      staleTime: 15_000,
      // Admin data is edited by several people at once, so coming back to the tab
      // should show what is actually there rather than what was there an hour ago.
      refetchOnWindowFocus: true,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
