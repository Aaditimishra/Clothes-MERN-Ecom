import type { ApiErrorBody } from '@shop/shared';

const BASE_URL = '/api/admin';
const TOKEN_KEY = 'threadline.admin.token';

export class AdminError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

const safeStorage = {
  get: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* a browser with site data blocked still gets a working session */
    }
  },
  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to clean up */
    }
  },
};

export const getToken = (): string | null => safeStorage.get(TOKEN_KEY);
export const setToken = (token: string): void => safeStorage.set(TOKEN_KEY, token);
export const clearToken = (): void => safeStorage.remove(TOKEN_KEY);

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** A `FormData` body skips JSON encoding so the browser sets the boundary. */
  form?: FormData;
}

export const api = async <T>(
  path: string,
  { method = 'GET', body, form }: RequestOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    /**
     * A 401 clears the token before anything else sees the error.
     *
     * Otherwise an expired session leaves the admin in a loop: every query
     * fails, each one shows its own error toast, and the app never reaches the
     * sign-in screen that would fix it.
     */
    if (response.status === 401) clearToken();

    const error = (payload as ApiErrorBody | null)?.error;
    throw new AdminError(
      response.status,
      error?.code ?? 'network_error',
      error?.message ?? 'Something went wrong.',
      error?.fields ?? {},
    );
  }

  return payload as T;
};

export const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/**
 * Downloads a CSV the API only serves to an authenticated staff session.
 *
 * A plain `<a href>` cannot carry the Authorization header, and putting the
 * token in the query string would leak it into browser history and server logs.
 * Fetching to a blob and clicking a synthetic link is the way that keeps the
 * credential in the header where it belongs.
 */
export const downloadCsv = async (path: string, filename: string): Promise<void> => {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, { headers });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const error = (payload as ApiErrorBody | null)?.error;
    throw new AdminError(
      response.status,
      error?.code ?? 'export_failed',
      error?.message ?? 'Could not export.',
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();

  // Without this the blob stays in memory for the life of the tab; a merchant
  // exporting all day would leak a copy of every file they downloaded.
  URL.revokeObjectURL(url);
};
