import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, clearToken, getToken, setToken } from './api';
import type { Session } from './types';

interface SessionContextValue {
  session: Session | null;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Re-reads the session — used after editing your own profile. */
  refresh: () => Promise<void>;
  /** True when this user holds the permission. Used to hide, not just disable. */
  can: (permission: string) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }

    let cancelled = false;

    api<Session>('/auth/me')
      .then((result) => {
        if (!cancelled) setSession(result);
      })
      // The api helper already clears an invalid token; there is nothing to
      // recover here beyond appearing signed out.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api<{ token: string }>('/auth/sign-in', {
      method: 'POST',
      body: { email, password },
    });

    setToken(result.token);
    setSession(await api<Session>('/auth/me'));
  }, []);

  const refresh = useCallback(async () => {
    setSession(await api<Session>('/auth/me'));
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setSession(null);
    // Every cached page holds data this user could see. Clearing on sign-out
    // stops the next person at this desk reading it from the cache.
    queryClient.clear();
  }, [queryClient]);

  const can = useCallback(
    (permission: string) => session?.staff.permissions.includes(permission) ?? false,
    [session],
  );

  const value = useMemo(
    () => ({ session, isReady, signIn, signOut, refresh, can }),
    [session, isReady, signIn, signOut, refresh, can],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
};
