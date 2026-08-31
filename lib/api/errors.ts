/**
 * Shared API response envelope helpers for routes under `app/api/`.
 *
 * Wire shape (canonical reference: `docs/api/envelope.md`):
 *
 *   type ApiSuccess<T> = { ok: true; data?: T };
 *   type ApiError = {
 *     ok: false;
 *     error: { code: string; message: string; details?: unknown[] };
 *   };
 *
 * Codes are SCREAMING_SNAKE and stable. `error.message` is short and
 * safe to log; it is not UI copy. Clients branch on `error.code`.
 *
 * Streaming routes (e.g. /api/ask) keep their own wire format because
 * SSE error frames are a different protocol. The inner `code` / `message`
 * fields still match this envelope so a client can share a mapper.
 */

export interface ApiSuccess<T = unknown> {
  ok: true;
  data?: T;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

/**
 * Build a standard error JSON Response.
 *
 * @param code     SCREAMING_SNAKE error code (e.g. INVALID_PARAMS).
 * @param message  Short human-readable message, not UI copy.
 * @param status   HTTP status code.
 * @param details  Optional ordered list of machine-readable details.
 * @param headers  Optional extra response headers (e.g. Retry-After).
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown[],
  headers?: Record<string, string>,
): Response {
  const body: ApiErrorBody = {
    ok: false,
    error: details && details.length > 0
      ? { code, message, details }
      : { code, message },
  };
  return Response.json(body, { status, headers });
}

/**
 * Build a standard success JSON Response.
 *
 * @param data    Payload nested under `data`. Pass `undefined` for an
 *                ack-only success (the route just confirms it worked).
 * @param status  HTTP status code, defaults to 200.
 * @param headers Optional extra response headers (e.g. Cache-Control).
 */
export function successResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>,
): Response {
  const body: ApiSuccess<T> =
    data === undefined ? { ok: true } : { ok: true, data };
  return Response.json(body, { status, headers });
}
