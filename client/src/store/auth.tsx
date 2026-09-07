import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse, CustomerView } from '@shop/shared';

import { request } from '../lib/api';
import { storage, STORAGE_KEYS } from '../lib/storage';

interface AuthContextValue {
  customer: CustomerView | null;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  signOut: () => void;
  setCustomer: (customer: CustomerView) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [customer, setCustomer] = useState<CustomerView | null>(null);
  /**
   * Guards the first paint.
   *
   * The token is in storage but the customer it belongs to is not. Without this
   * flag, a signed-in shopper sees "Sign in" flash in the header before the
   * lookup resolves, and any route guard would bounce them to the sign-in page
   * on a hard refresh.
   */
  const [isReady, setIsReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = storage.get(STORAGE_KEYS.token);
    if (!token) {
      setIsReady(true);
      return;
    }

    let cancelled = false;

    request<CustomerView>('/auth/me')
      .then((result) => {
        if (!cancelled) setCustomer(result);
      })
      .catch(() => {
        // The token is expired or revoked. Clearing it is the whole recovery —
        // the shopper simply appears signed out.
        storage.remove(STORAGE_KEYS.token);
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback(
    (result: AuthResponse) => {
      storage.set(STORAGE_KEYS.token, result.token);
      setCustomer(result.customer);
      // The bag merged server-side during sign-in, so the cached copy is stale.
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      adopt(
        await request<AuthResponse>('/auth/sign-in', {
          method: 'POST',
          body: { email, password },
          withCart: true,
        }),
      );
    },
    [adopt],
  );

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (input) => {
      adopt(
        await request<AuthResponse>('/auth/sign-up', {
          method: 'POST',
          body: input,
          withCart: true,
        }),
      );
    },
    [adopt],
  );

  const signOut = useCallback(() => {
    storage.remove(STORAGE_KEYS.token);
    // The bag id goes too. It now points at a bag owned by the account that just
    // signed out, and leaving it behind would show the next person their items.
    storage.remove(STORAGE_KEYS.cartId);
    setCustomer(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ customer, isReady, signIn, signUp, signOut, setCustomer }),
    [customer, isReady, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
