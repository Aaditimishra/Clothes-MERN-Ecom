import { z } from 'zod';

/**
 * Twelve characters, no composition rules.
 *
 * Length beats character classes: `Xy7!q` satisfies most "one of each" policies
 * and falls to a dictionary attack, while a long passphrase does not. Rules that
 * demand a symbol mostly teach people to append `!`.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'That is longer than we can store');

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'Tell us your first name').max(60),
  lastName: z.string().trim().min(1, 'Tell us your last name').max(60),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  // No length rule on sign-in: the stored password may predate any rule, and
  // rejecting it here would lock the owner out of their own account.
  password: z.string().min(1, 'Enter your password'),
});

/** Indian PIN codes are exactly six digits and never start with zero. */
export const addressSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the recipient name').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  line1: z.string().trim().min(1, 'Enter the street address').max(200),
  line2: z.string().trim().max(200).nullish().transform((value) => value || null),
  city: z.string().trim().min(1, 'Enter the city').max(80),
  state: z.string().trim().min(1, 'Enter the state').max(80),
  postalCode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code'),
  country: z.string().trim().length(2).default('IN'),
});

export const savedAddressSchema = addressSchema.extend({
  label: z.string().trim().max(40).default('Home'),
  isDefault: z.boolean().default(false),
});
