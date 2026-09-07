import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';

import { ApiError } from '../lib/api-error';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
};

/** Mongo's duplicate-key code. Worth naming — `11000` explains nothing. */
const DUPLICATE_KEY = 11000;

const translate = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      fields[issue.path.join('.') || '_'] ??= issue.message;
    }
    return ApiError.badRequest('Please check the highlighted fields', fields);
  }

  if (error instanceof MongooseError.ValidationError) {
    const fields = Object.fromEntries(
      Object.entries(error.errors).map(([path, detail]) => [path, detail.message]),
    );
    return ApiError.badRequest('Please check the highlighted fields', fields);
  }

  if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
    // The raw driver message leaks the index name and the collection. A shopper
    // who reuses an email needs "that email is already registered", not
    // `E11000 duplicate key error collection: threadline.customers index: email_1`.
    const field = Object.keys(error.keyPattern ?? {})[0] ?? 'value';
    return ApiError.conflict(`That ${field} is already in use`, {
      [field]: 'Already in use',
    });
  }

  return new ApiError(500, 'internal_error', 'Something went wrong on our end');
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // Express only treats a handler as an error handler if it takes four
  // arguments, and delegates to its default if headers are already sent.
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = translate(error);

  if (apiError.status >= 500) {
    console.error('[error]', error);
  }

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.fields ? { fields: apiError.fields } : {}),
      // The stack is a development aid and a production disclosure. Gated, not
      // trimmed, so there is no chance of it slipping out in a stray field.
      ...(env.isProduction || apiError.status < 500
        ? {}
        : { stack: (error as Error).stack }),
    },
  });
};
