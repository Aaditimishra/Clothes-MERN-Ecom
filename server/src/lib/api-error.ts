/**
 * The only error type handlers should throw.
 *
 * Carrying the status code on the error is what lets every route stay free of
 * `res.status(...)` plumbing: throw, and the error middleware turns it into the
 * single response envelope the client knows how to read.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, fields?: Record<string, string>): ApiError {
    return new ApiError(400, 'bad_request', message, fields);
  }

  static unauthorized(message = 'Sign in to continue'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(message = 'You do not have access to this'): ApiError {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message: string, fields?: Record<string, string>): ApiError {
    return new ApiError(409, 'conflict', message, fields);
  }

  /** The shopper's action is valid but the shop's state says no. */
  static unprocessable(message: string, fields?: Record<string, string>): ApiError {
    return new ApiError(422, 'unprocessable', message, fields);
  }
}
