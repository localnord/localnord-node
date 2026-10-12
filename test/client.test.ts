import { describe, expect, it, vi } from "vitest";
import { Localnord, LocalnordError } from "../src/index.js";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("unexpected call");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const client = (fetch: typeof globalThis.fetch) => new Localnord({ apiKey: "lnk_test", fetch, maxRetries: 2 });

describe("Localnord client", () => {
  it("refuses to start without an API key", () => {
    vi.stubEnv("LOCALNORD_API_KEY", "");
    expect(() => new Localnord({ fetch: vi.fn() as unknown as typeof fetch })).toThrow(/Missing API key/);
    vi.unstubAllEnvs();
  });

  it("reads LOCALNORD_API_KEY from the environment", async () => {
    vi.stubEnv("LOCALNORD_API_KEY", "lnk_env");
    const { fetch, calls } = fakeFetch([json({ data: [] })]);
    await new Localnord({ fetch }).listings.list();
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer lnk_env");
    vi.unstubAllEnvs();
  });

  it("sends the key, builds the query string and unwraps `data`", async () => {
    const { fetch, calls } = fakeFetch([json({ data: { total: 3 } })]);
    const stats = await client(fetch).reviews.stats("listing-1");
    expect(stats).toEqual({ total: 3 });
    expect(calls[0]!.url).toBe("https://app.localnord.io/api/v1/reviews/stats?listing_id=listing-1");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer lnk_test");
    expect(headers["User-Agent"]).toMatch(/^localnord-node\//);
  });

  it("drops undefined query values", async () => {
    const { fetch, calls } = fakeFetch([json({ data: [], pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 } })]);
    await client(fetch).reviews.list({ filter: "unreplied", listing_id: undefined });
    expect(calls[0]!.url).toBe("https://app.localnord.io/api/v1/reviews?filter=unreplied");
  });

  it("posts a JSON body with the idempotency key", async () => {
    const { fetch, calls } = fakeFetch([json({ data: { review_id: "r1", replied_at: "2026-10-12T10:00:00Z" } })]);
    await client(fetch).reviews.reply("r1", "Merci !", { idempotencyKey: "reply-r1" });
    const { init } = calls[0]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ review_id: "r1", reply_text: "Merci !" });
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("reply-r1");
  });

  it("walks every page with listAll", async () => {
    const page = (n: number, ids: string[]) => json({ data: ids.map((id) => ({ id })), pagination: { page: n, per_page: 2, total: 3, total_pages: 2 } });
    const { fetch, calls } = fakeFetch([page(1, ["a", "b"]), page(2, ["c"])]);
    const ids: string[] = [];
    for await (const review of client(fetch).reviews.listAll({ per_page: 2 })) ids.push(review.id);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(calls.map((c) => new URL(c.url).searchParams.get("page"))).toEqual(["1", "2"]);
  });

  it("retries a GET after a 429, honouring Retry-After", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([json({ error: "Too many requests" }, 429, { "Retry-After": "1" }), json({ data: [] })]);
    const pending = client(fetch).listings.list();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });

  it("never retries a POST without an idempotency key", async () => {
    const { fetch, calls } = fakeFetch([json({ error: "Bad gateway" }, 502)]);
    await expect(client(fetch).publications.create({ listing_id: "l1", subject: "s", text: "t" })).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(1);
  });

  it("retries a POST that carries an idempotency key", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([new TypeError("fetch failed"), json({ data: { id: "p1" } }, 201)]);
    const pending = client(fetch).publications.create({ listing_id: "l1", subject: "s", text: "t" }, { idempotencyKey: "post-1" });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ id: "p1" });
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });

  it("maps string and object error bodies to LocalnordError", async () => {
    const { fetch } = fakeFetch([json({ error: "Avis déjà répondu" }, 409), json({ error: { code: "not_found", message: "Listing not found" } }, 404)]);
    const localnord = client(fetch);

    const conflict = await localnord.reviews.reply("r1", "Merci").catch((e: unknown) => e);
    expect(conflict).toBeInstanceOf(LocalnordError);
    expect(conflict).toMatchObject({ status: 409, code: null, message: "Avis déjà répondu" });

    const missing = await localnord.listings.get("nope").catch((e: unknown) => e);
    expect(missing).toMatchObject({ status: 404, code: "not_found", message: "Listing not found" });
  });

  it("gives up after maxRetries and reports the last status", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = fakeFetch([json({ error: "down" }, 503), json({ error: "down" }, 503), json({ error: "still down" }, 503)]);
    const pending = client(fetch).account.get().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toMatchObject({ status: 503, message: "still down" });
    expect(calls).toHaveLength(3);
    vi.useRealTimers();
  });

  it("exposes request() for endpoints without a helper", async () => {
    const { fetch, calls } = fakeFetch([json({ data: [{ keyword: "plombier" }] })]);
    const result = await client(fetch).request<{ data: { keyword: string }[] }>("GET", "/rankings", { query: { listing_id: "l1" } });
    expect(result.data[0]!.keyword).toBe("plombier");
    expect(calls[0]!.url).toBe("https://app.localnord.io/api/v1/rankings?listing_id=l1");
  });

  it("rejects an idempotency key that an HTTP header cannot carry, before any call", async () => {
    for (const key of ["", "post-Horaires d’hiver", "clé", "x".repeat(201)]) {
      const { fetch, calls } = fakeFetch([]);
      await expect(client(fetch).reviews.reply("r1", "Merci", { idempotencyKey: key })).rejects.toMatchObject({ code: "invalid_idempotency_key" });
      expect(calls).toHaveLength(0);
    }
  });

  it("retries while the same idempotency key is still in flight", async () => {
    vi.useFakeTimers();
    const inFlight = json({ error: { code: "idempotency_in_flight", message: "already being processed" } }, 409);
    const { fetch, calls } = fakeFetch([inFlight, json({ data: { review_id: "r1", replied_at: "now" } })]);
    const pending = client(fetch).reviews.reply("r1", "Merci", { idempotencyKey: "reply-r1" });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toMatchObject({ review_id: "r1" });
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });

  it("calls a custom fetch without binding it to the client", async () => {
    let receivedThis: unknown = "unset";
    const fetch = function (this: unknown) {
      receivedThis = this;
      return Promise.resolve(json({ data: [] }));
    } as unknown as typeof globalThis.fetch;
    await client(fetch).listings.list();
    expect(receivedThis).toBeUndefined();
  });
});
