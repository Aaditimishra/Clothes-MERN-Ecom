import { CART_ID_HEADER, type ApiErrorBody } from '@shop/shared';

import { storage, STORAGE_KEYS } from './storage';

const BASE_URL = '/api';

/**
 * A failed request, with the server's field map intact.
 *
 * Forms read `fields` to highlight the offending input. Flattening the error to
 * a string here would mean every form has to re-parse a sentence to find out
 * which box was wrong.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send the bag id header. Only the bag and checkout endpoints need it. */
  withCart?: boolean;
  signal?: AbortSignal;
}

export const request = async <T>(
  path: string,
  { method = 'GET', body, withCart = false, signal }: RequestOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = storage.get(STORAGE_KEYS.token);
  if (token) headers.Authorization = `Bearer ${token}`;

  const cartId = storage.get(STORAGE_KEYS.cartId);
  if (withCart && cartId) headers[CART_ID_HEADER] = cartId;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });

  if (response.status === 204) return undefined as T;

  // A gateway or proxy failure returns HTML, not JSON. Parsing it would throw a
  // SyntaxError that says nothing about what actually went wrong.
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? 'network_error',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.fields ?? {},
    );
  }

  return payload as T;
};

/** Builds a query string, dropping empties so URLs stay readable and cacheable. */
export const toQueryString = (
  params: Record<string, string | number | string[] | undefined | null>,
): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;

    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
};
