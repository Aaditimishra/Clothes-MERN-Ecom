import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route so a rejected promise reaches the error middleware.
 *
 * Express 4 does not await handlers. Without this, a throw inside an `async`
 * route becomes an unhandled rejection: the client waits until it times out and
 * the log shows nothing useful. Every async route in this codebase goes through
 * here.
 */
export const asyncHandler =
  <T>(handler: (req: Request, res: Response, next: NextFunction) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
