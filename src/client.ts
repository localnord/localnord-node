import { LocalnordError, parseErrorBody } from "./errors.js";
import { AccountResource } from "./resources/account.js";
import { ListingsResource } from "./resources/listings.js";
import { PublicationsResource } from "./resources/publications.js";
import { ReviewsResource } from "./resources/reviews.js";
import type { RequestOptions } from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://app.localnord.io/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_BACKOFF_MS = 8_000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
/** A first request with the same key is still running: worth another try. */
const IN_FLIGHT_CODE = "idempotency_in_flight";
const IDEMPOTENCY_KEY_MAX = 200;
/** Printable ASCII only: HTTP headers cannot carry accents or emoji. */
const IDEMPOTENCY_KEY_PATTERN = /^[\x20-\x7E]+$/;

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type QueryValue = string | number | boolean | null | undefined;

export interface LocalnordOptions {
  /** `lnk_…` key from Settings › API. Defaults to `process.env.LOCALNORD_API_KEY`. */
  apiKey?: string;
  /** Defaults to `https://app.localnord.io/api/v1`. */
  baseUrl?: string;
  /** Per-attempt timeout (default 30 s). */
  timeoutMs?: number;
  /** Retries on 429, 5xx and network errors for GETs and idempotent calls (default 2). */
  maxRetries?: number;
  /** Custom fetch (tests, proxies). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export interface CallOptions extends RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertIdempotencyKey(key: string): void {
  if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new LocalnordError(`Invalid idempotency key: 1 to ${IDEMPOTENCY_KEY_MAX} printable ASCII characters (no accents or emoji).`, {
      status: 0,
      code: "invalid_idempotency_key",
    });
  }
}

function readEnvKey(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.LOCALNORD_API_KEY;
}

function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function backoffMs(attempt: number, retryAfter: number | null): number {
  if (retryAfter !== null) return Math.min(retryAfter * 1000, MAX_BACKOFF_MS * 4);
  const base = Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
  return base / 2 + Math.random() * (base / 2);
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Localnord API client.
 *
 * ```ts
 * const localnord = new Localnord({ apiKey: process.env.LOCALNORD_API_KEY });
 * const listings = await localnord.listings.list();
 * ```
 */
export class Localnord {
  readonly account: AccountResource;
  readonly listings: ListingsResource;
  readonly reviews: ReviewsResource;
  readonly publications: PublicationsResource;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LocalnordOptions = {}) {
    const apiKey = options.apiKey ?? readEnvKey();
    if (!apiKey) {
      throw new LocalnordError("Missing API key: pass `apiKey` or set LOCALNORD_API_KEY (create one at https://app.localnord.io/dashboard/settings/api).", { status: 0 });
    }
    // Bound: browsers and workers throw "Illegal invocation" on an unbound fetch.
    const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) throw new LocalnordError("No fetch implementation found: use Node.js 20+ or pass `fetch`.", { status: 0 });

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = fetchImpl;

    this.account = new AccountResource(this);
    this.listings = new ListingsResource(this);
    this.reviews = new ReviewsResource(this);
    this.publications = new PublicationsResource(this);
  }

  /**
   * Calls any v1 endpoint, for the ones without a dedicated helper.
   *
   * ```ts
   * await localnord.request("GET", "/rankings", { query: { listing_id } });
   * ```
   */
  async request<T = unknown>(method: HttpMethod, path: string, options: CallOptions = {}): Promise<T> {
    if (options.idempotencyKey !== undefined) assertIdempotencyKey(options.idempotencyKey);
    const url = this.buildUrl(path, options.query);
    const retryable = method === "GET" || options.idempotencyKey !== undefined;
    const attempts = retryable ? this.maxRetries + 1 : 1;

    for (let attempt = 0; ; attempt++) {
      const isLast = attempt + 1 >= attempts;
      let response: Response;
      try {
        response = await this.send(method, url, options);
      } catch (error) {
        if (options.signal?.aborted || isLast) throw this.networkError(error);
        await sleep(backoffMs(attempt, null));
        continue;
      }

      if (response.ok) return (await readBody(response)) as T;

      const retryAfter = retryAfterSeconds(response);
      if (!isLast && RETRYABLE_STATUSES.has(response.status)) {
        await response.body?.cancel();
        await sleep(backoffMs(attempt, retryAfter));
        continue;
      }
      const error = await this.httpError(response, retryAfter);
      if (!isLast && error.code === IN_FLIGHT_CODE) {
        await sleep(backoffMs(attempt, retryAfter));
        continue;
      }
      throw error;
    }
  }

  private buildUrl(path: string, query: Record<string, QueryValue> | undefined): string {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async send(method: HttpMethod, url: string, options: CallOptions): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": `localnord-node/${VERSION}`,
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const fetchImpl = this.fetchImpl;
    return fetchImpl(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  }

  private networkError(error: unknown): LocalnordError {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    const message = isTimeout ? `Request timed out after ${this.timeoutMs} ms` : `Network error: ${error instanceof Error ? error.message : String(error)}`;
    return new LocalnordError(message, { status: 0, code: isTimeout ? "timeout" : "network_error" });
  }

  private async httpError(response: Response, retryAfter: number | null): Promise<LocalnordError> {
    const body = await readBody(response);
    const { message, code } = parseErrorBody(body);
    return new LocalnordError(message ?? `HTTP ${response.status}`, { status: response.status, code, body, retryAfter });
  }
}
