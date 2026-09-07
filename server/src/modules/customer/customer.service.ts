import bcrypt from 'bcryptjs';
import {
  newId,
  type CustomerView,
  type PaymentMethodView,
  type ProductSummaryView,
} from '@shop/shared';

import { ApiError } from '../../lib/api-error';
import { CustomerModel, type AddressDoc } from '../../models/customer.model';
import { ProductModel, type ProductDoc } from '../../models/product.model';
import { toSummary } from '../catalog/catalog.mapper';
import { toCustomerView } from '../auth/auth.service';

/**
 * What a caller may set on an address.
 *
 * Deliberately its own interface rather than the Mongoose subdocument type: the
 * service contract should not change shape because the ODM did, and `id` is the
 * server's to mint, never the client's to supply.
 */
export interface AddressInput {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

const loadCustomer = async (customerId: string) => {
  const customer = await CustomerModel.findById(customerId).exec();
  if (!customer) throw ApiError.unauthorized('Your session is no longer valid');
  return customer;
};

/**
 * Exactly one address is the default.
 *
 * Enforced on write rather than trusted from the client: two defaults means
 * checkout picks arbitrarily, and no default means the shopper re-enters an
 * address they already saved.
 */
const applyDefault = (addresses: AddressDoc[], defaultId: string | null): void => {
  const target = defaultId ?? addresses[0]?.id ?? null;
  for (const address of addresses) {
    address.isDefault = address.id === target;
  }
};

const currentDefault = (addresses: AddressDoc[]): string | null =>
  addresses.find((address) => address.isDefault)?.id ?? null;

export const addAddress = async (
  customerId: string,
  input: AddressInput,
): Promise<CustomerView> => {
  const customer = await loadCustomer(customerId);
  const address = { ...input, id: newId('adr') } as AddressDoc;

  customer.addresses.push(address);

  // The first address a shopper saves becomes the default whether they asked or
  // not; after that, only an explicit request moves it.
  const isFirst = customer.addresses.length === 1;
  const promote = address.isDefault || isFirst;
  applyDefault(customer.addresses, promote ? address.id : currentDefault(customer.addresses));

  await customer.save();
  return toCustomerView(customer);
};


export const updateAddress = async (
  customerId: string,
  addressId: string,
  input: AddressInput,
): Promise<CustomerView> => {
  const customer = await loadCustomer(customerId);
  const existing = customer.addresses.find((address) => address.id === addressId);
  if (!existing) throw ApiError.notFound('No such address');

  Object.assign(existing, input, { id: addressId });
  applyDefault(
    customer.addresses,
    input.isDefault ? addressId : currentDefault(customer.addresses),
  );

  await customer.save();
  return toCustomerView(customer);
};

export const removeAddress = async (
  customerId: string,
  addressId: string,
): Promise<CustomerView> => {
  const customer = await loadCustomer(customerId);
  const remaining = customer.addresses.filter((address) => address.id !== addressId);
  if (remaining.length === customer.addresses.length) {
    throw ApiError.notFound('No such address');
  }

  customer.set('addresses', remaining);
  // Deleting the default promotes the next one, so the shopper is never left
  // with saved addresses and none selected.
  applyDefault(customer.addresses, currentDefault(customer.addresses));

  await customer.save();
  return toCustomerView(customer);
};

export const getWishlist = async (customerId: string): Promise<ProductSummaryView[]> => {
  const customer = await loadCustomer(customerId);
  if (customer.wishlist.length === 0) return [];

  const products = await ProductModel.find({
    _id: { $in: customer.wishlist },
    status: 'active',
  }).lean();

  // Re-ordered to match the wishlist, newest saved first. `$in` returns storage
  // order, which would shuffle the list every time the shopper opens it.
  const byId = new Map((products as ProductDoc[]).map((product) => [product._id, product]));

  return customer.wishlist
    .flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    .reverse()
    .map(toSummary);
};

/** Returns the new state so the heart icon can settle without a second request. */
export const toggleWishlist = async (
  customerId: string,
  productId: string,
): Promise<{ saved: boolean }> => {
  if (!(await ProductModel.exists({ _id: productId }))) {
    throw ApiError.notFound('No such product');
  }

  const customer = await loadCustomer(customerId);
  const saved = !customer.wishlist.includes(productId);

  await CustomerModel.updateOne(
    { _id: customerId },
    saved ? { $addToSet: { wishlist: productId } } : { $pull: { wishlist: productId } },
  );

  return { saved };
};

/* ------------------------------ profile ------------------------------- */

export interface ProfileInput {
  firstName: string;
  lastName: string;
  phone: string | null;
  acceptsMarketing: boolean;
}

export const updateProfile = async (
  customerId: string,
  input: ProfileInput,
): Promise<CustomerView> => {
  const customer = await loadCustomer(customerId);

  // The email is deliberately not editable here. It identifies the account, is
  // where order confirmations go, and changing it without re-verifying would let
  // anyone with a borrowed session redirect a stranger's receipts.
  customer.firstName = input.firstName.trim();
  customer.lastName = input.lastName.trim();
  customer.phone = input.phone;
  customer.acceptsMarketing = input.acceptsMarketing;

  await customer.save();
  return toCustomerView(customer);
};

const BCRYPT_ROUNDS = 12;

export const changePassword = async (
  customerId: string,
  currentPassword: string,
  nextPassword: string,
): Promise<void> => {
  const customer = await CustomerModel.findById(customerId).select('+passwordHash').exec();
  if (!customer) throw ApiError.unauthorized('Your session is no longer valid');

  // The current password is required even though the session is already valid.
  // A borrowed laptop should not be enough to lock the owner out of their own
  // account, and this is the one check that stops it.
  if (!(await bcrypt.compare(currentPassword, customer.passwordHash))) {
    throw ApiError.badRequest('That is not your current password', {
      currentPassword: 'Incorrect',
    });
  }

  customer.passwordHash = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);
  await customer.save();
};

/* --------------------------- payment methods --------------------------- */

export interface PaymentMethodInput {
  type: 'card' | 'upi';
  brand?: string | null;
  /** Cards: the full number as typed. Only the last four are ever stored. */
  cardNumber?: string;
  upiId?: string;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  label?: string;
  isDefault?: boolean;
}

const toPaymentView = (method: {
  id: string;
  type: string;
  brand?: string | null;
  last4?: string | null;
  upiId?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  label?: string | null;
  isDefault?: boolean | null;
}): PaymentMethodView => ({
  id: method.id,
  type: method.type as PaymentMethodView['type'],
  brand: method.brand ?? null,
  last4: method.last4 ?? null,
  upiId: method.upiId ?? null,
  expiryMonth: method.expiryMonth ?? null,
  expiryYear: method.expiryYear ?? null,
  label: method.label ?? '',
  isDefault: method.isDefault ?? false,
});

export const listPaymentMethods = async (
  customerId: string,
): Promise<PaymentMethodView[]> => {
  const customer = await loadCustomer(customerId);
  return customer.paymentMethods.map(toPaymentView);
};

/**
 * Detects the network from the leading digits.
 *
 * Enough to show the right label next to "•••• 4242"; deliberately not a
 * validity check, because a card that fails this would fail at the gateway
 * anyway and rejecting it here only blocks legitimate new BIN ranges.
 */
const brandOf = (cardNumber: string): string => {
  const digits = cardNumber.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^(60|65|81|82|508)/.test(digits)) return 'rupay';
  if (/^3[47]/.test(digits)) return 'amex';
  return 'card';
};

export const addPaymentMethod = async (
  customerId: string,
  input: PaymentMethodInput,
): Promise<PaymentMethodView[]> => {
  const customer = await loadCustomer(customerId);

  const digits = (input.cardNumber ?? '').replace(/\D/g, '');

  const method = {
    id: newId('pay'),
    type: input.type,
    brand: input.type === 'card' ? brandOf(digits) : 'upi',
    // Only the last four survive this function. The full number is never
    // written anywhere — not to the document, not to a log.
    last4: input.type === 'card' ? digits.slice(-4) : null,
    upiId: input.type === 'upi' ? input.upiId ?? null : null,
    expiryMonth: input.expiryMonth ?? null,
    expiryYear: input.expiryYear ?? null,
    label: input.label ?? '',
    isDefault: false,
  };

  customer.paymentMethods.push(method as never);

  const shouldDefault = input.isDefault || customer.paymentMethods.length === 1;
  for (const entry of customer.paymentMethods) {
    entry.isDefault = shouldDefault
      ? entry.id === method.id
      : entry.isDefault ?? false;
  }

  await customer.save();
  return customer.paymentMethods.map(toPaymentView);
};

export const removePaymentMethod = async (
  customerId: string,
  methodId: string,
): Promise<PaymentMethodView[]> => {
  const customer = await loadCustomer(customerId);
  const remaining = customer.paymentMethods.filter((method) => method.id !== methodId);

  if (remaining.length === customer.paymentMethods.length) {
    throw ApiError.notFound('No such payment method');
  }

  customer.set('paymentMethods', remaining);

  // Removing the default promotes the next one, so the shopper is never left
  // with saved methods and none selected.
  if (customer.paymentMethods.length > 0 &&
      !customer.paymentMethods.some((method) => method.isDefault)) {
    customer.paymentMethods[0]!.isDefault = true;
  }

  await customer.save();
  return customer.paymentMethods.map(toPaymentView);
};

export const setDefaultPaymentMethod = async (
  customerId: string,
  methodId: string,
): Promise<PaymentMethodView[]> => {
  const customer = await loadCustomer(customerId);
  if (!customer.paymentMethods.some((method) => method.id === methodId)) {
    throw ApiError.notFound('No such payment method');
  }

  for (const method of customer.paymentMethods) {
    method.isDefault = method.id === methodId;
  }

  await customer.save();
  return customer.paymentMethods.map(toPaymentView);
};
