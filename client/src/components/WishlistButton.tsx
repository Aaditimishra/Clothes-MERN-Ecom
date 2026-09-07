import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { ProductSummaryView } from '@shop/shared';

import { request } from '../lib/api';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

interface WishlistButtonProps {
  productId: string;
  className?: string;
}

export const WISHLIST_KEY = ['wishlist'] as const;

export const useWishlist = () => {
  const { customer } = useAuth();

  return useQuery({
    queryKey: WISHLIST_KEY,
    queryFn: () => request<ProductSummaryView[]>('/account/wishlist'),
    // Never fires for a guest: there is nothing to fetch, and a 401 on every
    // page load would be noise in the console and the server log alike.
    enabled: Boolean(customer),
  });
};

export const WishlistButton = ({ productId, className = '' }: WishlistButtonProps) => {
  const { customer } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: wishlist } = useWishlist();

  const isSaved = wishlist?.some((product) => product.id === productId) ?? false;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      request<{ saved: boolean }>(`/account/wishlist/${productId}`, { method: 'POST' }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
      notify(result.saved ? 'Saved to your wishlist' : 'Removed from your wishlist');
    },
    onError: () => notify('Could not update your wishlist', 'error'),
  });

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    /**
     * A guest is sent to sign in, and brought straight back.
     *
     * Saving to a wishlist that vanishes on the next visit is worse than not
     * offering it, so this is one of the few places an account is genuinely
     * required — and the redirect carries the way back so the shopper does not
     * lose their place.
     */
    if (!customer) {
      navigate('/sign-in', { state: { from: window.location.pathname } });
      return;
    }

    mutate();
  };

  return (
    <button
      type="button"
      className={`wish ${className}${isSaved ? ' is-saved' : ''}`}
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isSaved}
      aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
      title={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 8.4a4.4 4.4 0 0 1 7.5 2.5c0 5-7.5 9.6-7.5 9.6Z"
          fill={isSaved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};
