import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CartView } from '@shop/shared';

import { ApiRequestError, request } from '../lib/api';
import { storage, STORAGE_KEYS } from '../lib/storage';
import { useToast } from './toast';

interface CartContextValue {
  cart: CartView | null;
  itemCount: number;
  isLoading: boolean;
  isMutating: boolean;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = ['cart'] as const;

const fetchCart = () => request<CartView>('/cart', { withCart: true });

const ZERO = { amount: 0, currency: 'INR' } as const;

/**
 * The shape the server returns for a shopper with no bag.
 *
 * Kept here so the client can render an empty bag without waiting for a round
 * trip — used the moment an order is placed.
 */
const EMPTY_CART: CartView = {
  id: '',
  lines: [],
  itemCount: 0,
  totals: {
    mrpTotal: ZERO,
    subtotal: ZERO,
    savings: ZERO,
    couponDiscount: ZERO,
    shipping: ZERO,
    taxIncluded: ZERO,
    grandTotal: ZERO,
  },
  coupon: null,
  issues: [],
  freeShippingShortfall: null,
  updatedAt: new Date().toISOString(),
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const { data: cart, isLoading } = useQuery({
    queryKey: CART_KEY,
    queryFn: fetchCart,
    // Prices and stock move underneath a bag that sits open in a tab, so it is
    // refetched on focus rather than trusted indefinitely.
    staleTime: 30_000,
  });

  /**
   * Every mutation returns the whole bag, repriced by the server.
   *
   * Writing the response straight into the cache — rather than invalidating and
   * refetching — means one round trip instead of two, and the totals on screen
   * are always the ones the server just computed. A client that adds up its own
   * line items will eventually disagree with checkout, and the shopper is the
   * one who notices.
   */
  const commit = useCallback(
    (next: CartView) => {
      if (next.id) storage.set(STORAGE_KEYS.cartId, next.id);
      queryClient.setQueryData(CART_KEY, next);
    },
    [queryClient],
  );

  const mutation = useMutation({
    mutationFn: (action: () => Promise<CartView>) => action(),
    onSuccess: commit,
    onError: (error: unknown) => {
      notify(
        error instanceof ApiRequestError
          ? error.message
          : 'Could not update your bag. Please try again.',
        'error',
      );
    },
  });

  const run = useCallback(
    async (action: () => Promise<CartView>) => {
      await mutation.mutateAsync(action);
    },
    [mutation],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart: cart ?? null,
      itemCount: cart?.itemCount ?? 0,
      isLoading,
      isMutating: mutation.isPending,
      isDrawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),

      addItem: async (variantId, quantity = 1) => {
        await run(() =>
          request<CartView>('/cart/items', {
            method: 'POST',
            body: { variantId, quantity },
            withCart: true,
          }),
        );
        setDrawerOpen(true);
      },

      setQuantity: (variantId, quantity) =>
        run(() =>
          request<CartView>(`/cart/items/${variantId}`, {
            method: 'PATCH',
            body: { quantity },
            withCart: true,
          }),
        ),

      removeItem: (variantId) =>
        run(() =>
          request<CartView>(`/cart/items/${variantId}`, {
            method: 'DELETE',
            withCart: true,
          }),
        ),

      applyCoupon: (code) =>
        run(() =>
          request<CartView>('/cart/coupon', {
            method: 'POST',
            body: { code },
            withCart: true,
          }),
        ),

      removeCoupon: () =>
        run(() => request<CartView>('/cart/coupon', { method: 'DELETE', withCart: true })),
    }),
    [cart, isLoading, mutation.isPending, isDrawerOpen, run],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = (): CartContextValue => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
};

/**
 * Clears the bag once it has become an order.
 *
 * The empty bag is WRITTEN into the cache rather than the entry being removed.
 * `removeQueries` leaves the mounted observer holding its last result until a
 * refetch lands, so the header kept showing the old item count on the
 * confirmation page — the shopper had just paid and the badge still said 2.
 * Writing the known-correct value is synchronous; the invalidate that follows
 * reconciles with the server without anything stale being on screen in between.
 */
export const forgetCart = (queryClient: ReturnType<typeof useQueryClient>): void => {
  storage.remove(STORAGE_KEYS.cartId);
  queryClient.setQueryData(CART_KEY, EMPTY_CART);
  void queryClient.invalidateQueries({ queryKey: CART_KEY });
};
