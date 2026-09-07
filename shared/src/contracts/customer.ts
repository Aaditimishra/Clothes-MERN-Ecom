import type { SavedAddress } from './order';

/**
 * A saved payment method, as the account page renders it.
 *
 * Note what is absent: the card number, the CVV, and any token that could be
 * charged. The shop stores the brand, the last four digits and the expiry —
 * enough for a person to recognise their own card and nothing more.
 */
export interface PaymentMethodView {
  id: string;
  type: 'card' | 'upi';
  brand: string | null;
  last4: string | null;
  upiId: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  label: string;
  isDefault: boolean;
}

export interface CustomerView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  addresses: SavedAddress[];
  paymentMethods: PaymentMethodView[];
  acceptsMarketing: boolean;
  createdAt: string;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
  phone?: string | null;
  acceptsMarketing?: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResponse {
  token: string;
  customer: CustomerView;
}

export interface SignUpRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}
