import bcrypt from 'bcryptjs';
import { newId, type AuthResponse, type CustomerView } from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { CustomerModel, type CustomerDoc } from '../../models/customer.model';
import { issueToken } from './auth.tokens';

/**
 * Cost 12 ≈ 250 ms on current hardware.
 *
 * High enough that an offline attack on a leaked table is expensive, low enough
 * that a sign-in still feels instant. The number is deliberately a constant and
 * not an env var: it is a security parameter, and one that can be lowered by
 * configuration will be, on the day someone is debugging slow tests.
 */
const BCRYPT_ROUNDS = 12;

export const toCustomerView = (doc: CustomerDoc): CustomerView => ({
  id: doc._id,
  email: doc.email,
  firstName: doc.firstName,
  lastName: doc.lastName,
  phone: doc.phone ?? null,
  addresses: doc.addresses.map((address) => ({
    id: address.id,
    label: address.label ?? 'Home',
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault ?? false,
  })),
  paymentMethods: doc.paymentMethods.map((method) => ({
    id: method.id,
    type: method.type as 'card' | 'upi',
    brand: method.brand ?? null,
    last4: method.last4 ?? null,
    upiId: method.upiId ?? null,
    expiryMonth: method.expiryMonth ?? null,
    expiryYear: method.expiryYear ?? null,
    label: method.label ?? '',
    isDefault: method.isDefault ?? false,
  })),
  acceptsMarketing: doc.acceptsMarketing ?? false,
  createdAt: (doc.createdAt ?? new Date()).toISOString(),
});

export const signUp = async (input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<AuthResponse> => {
  const email = input.email.toLowerCase().trim();

  if (await CustomerModel.exists({ email })) {
    throw ApiError.conflict('An account with that email already exists', {
      email: 'Already registered',
    });
  }

  const customer = await CustomerModel.create({
    _id: newId('cus'),
    email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
  });

  return { token: issueToken(customer._id), customer: toCustomerView(customer) };
};

export const signIn = async (input: {
  email: string;
  password: string;
}): Promise<AuthResponse> => {
  const customer = await CustomerModel.findOne({ email: input.email.toLowerCase().trim() })
    .select('+passwordHash')
    .exec();

  /**
   * One message for both "no such account" and "wrong password".
   *
   * Distinguishing them turns the sign-in form into an oracle for which emails
   * are registered — useful to someone stuffing credentials, useless to the
   * shopper, who has to check both either way.
   */
  const invalid = ApiError.unauthorized('Email or password is incorrect');
  if (!customer) {
    // Still hash something. Returning early on an unknown email makes the
    // response measurably faster than a wrong password, and that timing
    // difference is the same oracle by another route.
    await bcrypt.compare(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw invalid;
  }

  if (!(await bcrypt.compare(input.password, customer.passwordHash))) throw invalid;

  return { token: issueToken(customer._id), customer: toCustomerView(customer) };
};

export const getCustomer = async (customerId: string): Promise<CustomerView> => {
  const customer = await CustomerModel.findById(customerId).exec();
  if (!customer) throw ApiError.unauthorized('Your session is no longer valid');
  return toCustomerView(customer);
};
