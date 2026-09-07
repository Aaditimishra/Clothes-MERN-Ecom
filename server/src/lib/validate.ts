import type { Request } from 'express';
import type { z } from 'zod';

import { ApiError } from './api-error';

/**
 * Parses a request part against a schema, or throws a 400 the client can render
 * against its own form fields.
 *
 * Zod's issue paths become the `fields` map, so `{ "shippingAddress.postalCode":
 * "Enter a 6-digit PIN code" }` lands on the right input instead of as a
 * sentence at the top of the checkout page.
 */
export const parseOrThrow = <S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  message = 'Please check the highlighted fields',
): z.infer<S> => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    // First issue per field wins: showing a shopper three messages about one
    // input is noise, and the first is the most specific.
    fields[key] ??= issue.message;
  }

  throw ApiError.badRequest(message, fields);
};

export const parseBody = <S extends z.ZodTypeAny>(req: Request, schema: S): z.infer<S> =>
  parseOrThrow(schema, req.body);

export const parseQuery = <S extends z.ZodTypeAny>(req: Request, schema: S): z.infer<S> =>
  parseOrThrow(schema, req.query, 'Invalid search parameters');
