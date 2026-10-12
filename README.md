# Localnord for Node.js

Official TypeScript client for the [Localnord](https://www.localnord.io/?utm_source=github&utm_medium=readme&utm_campaign=localnord-node) API: manage **Google Business Profile** listings from your own code. Reply to Google reviews, publish Google posts, sync listings, run audits and rank tracking, for one business or hundreds.

```ts
import { Localnord } from "localnord";

const localnord = new Localnord(); // reads LOCALNORD_API_KEY

for await (const review of localnord.reviews.listAll({ filter: "unreplied" })) {
  console.log(review.rating, review.comment);
}
```

- Typed responses, zero runtime dependencies, ESM and CommonJS
- Automatic retries on `429` and `5xx` (GETs and calls with an idempotency key)
- Pagination helpers, idempotency keys, typed errors
- Every other endpoint reachable through `request()`

## 1. Get an API key

1. [Create a Localnord account](https://app.localnord.io/auth/signup?utm_source=github&utm_medium=readme&utm_campaign=localnord-node) (free trial) and connect your Google Business Profile.
2. Open [**Settings › API**](https://app.localnord.io/dashboard/settings/api?utm_source=github&utm_medium=readme&utm_campaign=localnord-node) and create a key. It starts with `lnk_` and is shown once.
3. Restrict it to what your code needs: resources (`reviews:write`, `publications:draft`…), listings and an expiry date.

```bash
export LOCALNORD_API_KEY=lnk_...
```

## 2. Install

```bash
npm install localnord
```

Node.js 20 or later.

## 3. Use it

```ts
import { Localnord } from "localnord";

const localnord = new Localnord({ apiKey: process.env.LOCALNORD_API_KEY });

const listings = await localnord.listings.list();
const listing = listings[0];

// AI reply drafts in the listing's language (nothing is published)
const { drafts } = await localnord.reviews.generateReplies({ listing_id: listing.id, tone: "warm" });

// Publish one on Google
await localnord.reviews.reply(drafts[0].reviewId, drafts[0].replyDraft);

// Create a Google post, live within a minute
await localnord.publications.create({
  listing_id: listing.id,
  subject: "Winter opening hours",
  text: "From December 1st we open at 8am, Monday to Saturday.",
});
```

## Examples

Ready to run with `npx tsx`:

| Example | What it does |
|---|---|
| [`examples/reply-to-reviews.ts`](examples/reply-to-reviews.ts) | Drafts AI replies for new reviews (saved in Localnord); with `--publish`, also sends the 4★ and 5★ ones and leaves the rest for a human |
| [`examples/publish-post.ts`](examples/publish-post.ts) | Picks a subject, writes the post with AI and creates it as a draft or live |

```bash
LOCALNORD_API_KEY=lnk_... npx tsx examples/reply-to-reviews.ts            # drafts only
LOCALNORD_API_KEY=lnk_... npx tsx examples/reply-to-reviews.ts --publish
```

## What's covered

| Resource | Methods |
|---|---|
| `account` | `get` |
| `listings` | `list`, `get`, `sync` |
| `reviews` | `list`, `listAll`, `reply`, `bulkReply`, `deleteReply`, `stats`, `generateReplies` |
| `publications` | `list`, `listAll`, `create`, `update`, `delete`, `publish`, `generateSubjects`, `generateText` |

Everything else (photos, videos, audits, rank tracking, reports, review campaigns, webhooks, leads…) goes through `request()`:

```ts
const { data } = await localnord.request("GET", "/rankings", { query: { listing_id } });
```

Full reference: [API documentation](https://app.localnord.io/api/v1/docs.md) · [OpenAPI 3.1 spec](https://app.localnord.io/api/v1/openapi.json).

## Errors, retries and idempotency

Every failure throws a `LocalnordError` with `status`, `code` (when the API sends one), `body` and `retryAfter`.

```ts
import { LocalnordError } from "localnord";

try {
  await localnord.reviews.reply(reviewId, text, { idempotencyKey: `reply-${reviewId}` });
} catch (error) {
  if (error instanceof LocalnordError && error.status === 409) {
    // the review already has a reply
  } else {
    throw error;
  }
}
```

- **Retries**: GET requests and calls with an `idempotencyKey` are retried twice on `408`, `429`, `5xx` and network errors, honouring `Retry-After`. Change it with `new Localnord({ maxRetries })`.
- **Idempotency**: endpoints that publish to Google or spend credits accept `idempotencyKey` (1 to 200 printable ASCII characters, a UUID is ideal). A replay within 24 hours returns the first response instead of acting twice; the same key with a different body is a `409`.
- **Rate limits**: per organization, 300 requests a minute and 10,000 a day on a paid plan. Google writes are capped at 5 a second.

## Options

```ts
new Localnord({
  apiKey: "lnk_...",       // default: process.env.LOCALNORD_API_KEY
  timeoutMs: 30_000,       // per attempt
  maxRetries: 2,
  fetch: customFetch,      // proxies, tests
});
```

## More ways to connect

- [localnord-python](https://github.com/localnord/localnord-python): the same client for Python
- [localnord-mcp](https://github.com/localnord/localnord-mcp): use Localnord from Claude, ChatGPT, Cursor and other MCP clients
- [localnord-automation-templates](https://github.com/localnord/localnord-automation-templates): ready-made n8n and Make scenarios

## En français

Bibliothèque officielle pour piloter vos fiches Google Business Profile avec l'API Localnord : réponses aux avis, publications Google, synchronisation des fiches. [Créez votre compte](https://app.localnord.io/auth/signup?utm_source=github&utm_medium=readme&utm_campaign=localnord-node) (essai gratuit), puis votre clé dans [Paramètres › API](https://app.localnord.io/dashboard/settings/api?utm_source=github&utm_medium=readme&utm_campaign=localnord-node). La [documentation complète de l'API](https://app.localnord.io/api/v1/docs.md) est en français.

## License

[MIT](LICENSE)
