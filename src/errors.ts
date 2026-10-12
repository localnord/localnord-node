/** Error thrown for any non-2xx response, timeout or network failure. */
export class LocalnordError extends Error {
  /** HTTP status, or `0` for a timeout / network failure. */
  readonly status: number;
  /** Machine-readable code when the API returns one (`rate_limited`, `not_found`…). */
  readonly code: string | null;
  /** Parsed response body, when there is one. */
  readonly body: unknown;
  /** Seconds to wait before retrying, from the `Retry-After` header. */
  readonly retryAfter: number | null;

  constructor(message: string, options: { status: number; code?: string | null; body?: unknown; retryAfter?: number | null }) {
    super(message);
    this.name = "LocalnordError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.body = options.body;
    this.retryAfter = options.retryAfter ?? null;
  }
}

/**
 * The API returns `{ error: "message" }` on historical endpoints and
 * `{ error: { code, message } }` on newer ones; some add a top-level `code`.
 */
export function parseErrorBody(body: unknown): { message: string | null; code: string | null } {
  if (!body || typeof body !== "object") return { message: null, code: null };
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") {
    return { message: error, code: typeof record.code === "string" ? record.code : null };
  }
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    return {
      message: typeof nested.message === "string" ? nested.message : null,
      code: typeof nested.code === "string" ? nested.code : null,
    };
  }
  return { message: null, code: null };
}
