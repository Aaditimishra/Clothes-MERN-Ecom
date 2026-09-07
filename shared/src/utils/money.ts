/**
 * Money is stored and computed as an integer number of MINOR units (paise for
 * INR) — never as a float.
 *
 * WHY: `0.1 + 0.2 !== 0.3` in IEEE-754. On an invoice that surfaces as a
 * one-paisa mismatch between the line items and the total, which becomes a
 * customer complaint and a wrong GST filing. Integers make the arithmetic
 * exact, and the only place a decimal ever appears is the formatter below.
 */

export interface Money {
  /** Integer amount in minor units. `149900` is ₹1,499.00. */
  readonly amount: number;
  /** ISO-4217 code, e.g. `'INR'`. */
  readonly currency: string;
}

export class CurrencyMismatchError extends Error {
  constructor(left: string, right: string) {
    super(`Cannot combine amounts in ${left} and ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

export const money = (amount: number, currency = 'INR'): Money => {
  if (!Number.isInteger(amount)) {
    throw new TypeError(
      `Money amount must be an integer in minor units, received ${amount}`,
    );
  }
  return { amount, currency: currency.toUpperCase() };
};

/** `1499` → `₹1,499.00` as `{ amount: 149900 }`. For seeds and fixtures. */
export const rupees = (major: number): Money => money(Math.round(major * 100), 'INR');

const assertSameCurrency = (left: Money, right: Money): void => {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }
};

export const addMoney = (left: Money, right: Money): Money => {
  assertSameCurrency(left, right);
  return money(left.amount + right.amount, left.currency);
};

export const subtractMoney = (left: Money, right: Money): Money => {
  assertSameCurrency(left, right);
  return money(left.amount - right.amount, left.currency);
};

export const sumMoney = (amounts: readonly Money[], currency = 'INR'): Money =>
  amounts.reduce<Money>((total, current) => addMoney(total, current), money(0, currency));

/** Multiplies by a quantity, which must be a whole number of units. */
export const multiplyMoney = (value: Money, quantity: number): Money => {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`Quantity must be an integer, received ${quantity}`);
  }
  return money(value.amount * quantity, value.currency);
};

/** Applies a percentage (`18` for 18%) with half-up rounding, as GST expects. */
export const percentageOfMoney = (value: Money, percentage: number): Money =>
  money(Math.round((value.amount * percentage) / 100), value.currency);

/**
 * Extracts the tax already baked into a tax-inclusive price.
 *
 * NOT `percentageOfMoney`: on a ₹1,000 inclusive price at 12%, the tax is
 * 1000 − 1000/1.12 = ₹107.14, not ₹120. Getting this backwards overstates
 * every invoice by the tax on the tax.
 */
export const taxWithin = (grossValue: Money, ratePercent: number): Money =>
  money(
    grossValue.amount - Math.round((grossValue.amount * 100) / (100 + ratePercent)),
    grossValue.currency,
  );

export const isZeroMoney = (value: Money): boolean => value.amount === 0;

/** Presentation only — never feed the result back into arithmetic. */
export const formatMoney = (value: Money, locale = 'en-IN'): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    maximumFractionDigits: value.amount % 100 === 0 ? 0 : 2,
  }).format(value.amount / 100);

/** `149900` and `199900` → `25` (percent off, rounded down so we never overclaim). */
export const discountPercent = (price: Money, compareAt: Money | null): number | null => {
  if (!compareAt || compareAt.amount <= price.amount) return null;
  return Math.floor(((compareAt.amount - price.amount) / compareAt.amount) * 100);
};
