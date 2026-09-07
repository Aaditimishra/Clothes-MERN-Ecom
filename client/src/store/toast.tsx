import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

interface ToastContextValue {
  toasts: Toast[];
  notify: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_FOR_MS = 3200;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = (nextId.current += 1);
      setToasts((current) => [...current, { id, message, tone }]);
      // Auto-dismissed rather than requiring a click: these confirm an action
      // the shopper already took, so making them close it is busywork.
      window.setTimeout(() => dismiss(id), VISIBLE_FOR_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, notify, dismiss }), [toasts, notify, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
};
