import type { Context } from 'hono';
import { ZodError } from 'zod';
import { NotFoundError } from './repo';

export class HttpError extends Error {
  /**
   * Builds an error that maps to an HTTP status.
   * Precondition: `status` is 400, 413 or 415.
   * Postcondition: handleError answers with that status and `message`.
   */
  constructor(readonly status: 400 | 413 | 415, message: string) {
    super(message);
  }
}

/**
 * Converts thrown errors into JSON error responses.
 * Precondition: `err` was thrown while handling `c`.
 * Postcondition: NotFoundError -> 404, HttpError -> its status, ZodError/SyntaxError -> 400, anything else -> 500 (message logged).
 */
export function handleError(err: Error, c: Context): Response {
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof ZodError) return c.json({ error: err.message }, 400);
  if (err instanceof SyntaxError) return c.json({ error: 'Invalid JSON body' }, 400);
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
}
