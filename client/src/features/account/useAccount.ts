import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerView, OrderView, PaymentMethodView, SavedAddress } from '@shop/shared';

import { request } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { useToast } from '../../store/toast';

export const ORDERS_KEY = ['orders'] as const;

export const useOrders = () => {
  const { customer } = useAuth();

  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: () => request<OrderView[]>('/orders'),
    enabled: Boolean(customer),
  });
};

/**
 * Every account mutation returns the whole customer, and the auth store is
 * updated from it.
 *
 * The header, the checkout defaults and this page all read the same object, so
 * writing the response straight back keeps them in step without a refetch — and
 * without the moment where a saved address exists on the server but not yet in
 * the form that will use it.
 */
export const useAccountMutation = <TInput>(
  send: (input: TInput) => Promise<CustomerView>,
  successMessage: string,
) => {
  const { setCustomer } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: send,
    onSuccess: (customer) => {
      setCustomer(customer);
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      notify(successMessage);
    },
    onError: (error: unknown) => {
      notify(error instanceof Error ? error.message : 'Something went wrong', 'error');
    },
  });
};

export const saveAddress = (address: Omit<SavedAddress, 'id'> & { id?: string }) =>
  address.id
    ? request<CustomerView>(`/account/addresses/${address.id}`, { method: 'PUT', body: address })
    : request<CustomerView>('/account/addresses', { method: 'POST', body: address });

export const deleteAddress = (addressId: string) =>
  request<CustomerView>(`/account/addresses/${addressId}`, { method: 'DELETE' });

export const addPaymentMethod = (body: Record<string, unknown>) =>
  request<PaymentMethodView[]>('/account/payment-methods', { method: 'POST', body });

export const deletePaymentMethod = (methodId: string) =>
  request<PaymentMethodView[]>(`/account/payment-methods/${methodId}`, { method: 'DELETE' });

export const makePaymentDefault = (methodId: string) =>
  request<PaymentMethodView[]>(`/account/payment-methods/${methodId}/default`, {
    method: 'PUT',
  });
