/**
 * localStorage that never throws.
 *
 * Safari in private mode, a browser with site data blocked, and an embedded
 * webview all make `localStorage` access throw rather than return null. An
 * unguarded read at module scope takes the entire app down with a blank page, so
 * every access goes through here.
 */
const safe = <T>(action: () => T, fallback: T): T => {
  try {
    return action();
  } catch {
    return fallback;
  }
};

export const storage = {
  get: (key: string): string | null => safe(() => localStorage.getItem(key), null),
  set: (key: string, value: string): void => {
    safe(() => localStorage.setItem(key, value), undefined);
  },
  remove: (key: string): void => {
    safe(() => localStorage.removeItem(key), undefined);
  },
};

export const STORAGE_KEYS = {
  token: 'threadline.token',
  cartId: 'threadline.cartId',
  theme: 'threadline.theme',
  recentlyViewed: 'threadline.recentlyViewed',
} as const;
