import type { Localnord } from "../client.js";
import { paginate } from "../pagination.js";
import type { BulkReplyResult, GeneratedReplies, GenerateRepliesParams, Page, RequestOptions, Review, ReviewListParams, ReviewStats } from "../types.js";

export class ReviewsResource {
  constructor(private readonly client: Localnord) {}

  /** One page of Google reviews, newest first (or by `updated_at` with `updated_since`). */
  list(params: ReviewListParams = {}, options: RequestOptions = {}): Promise<Page<Review>> {
    return this.client.request<Page<Review>>("GET", "/reviews", { ...options, query: { ...params } });
  }

  /**
   * Every matching review, across pages.
   *
   * ```ts
   * for await (const review of localnord.reviews.listAll({ filter: "unreplied" })) { … }
   * ```
   */
  listAll(params: Omit<ReviewListParams, "page"> = {}, options: RequestOptions = {}): AsyncGenerator<Review> {
    return paginate((page) => this.list({ ...params, page }, options));
  }

  /** Publishes a reply on Google. A review that already has a reply returns `409`. */
  async reply(reviewId: string, replyText: string, options: RequestOptions = {}): Promise<{ review_id: string; replied_at: string }> {
    const { data } = await this.client.request<{ data: { review_id: string; replied_at: string } }>("POST", "/reviews", {
      ...options,
      body: { review_id: reviewId, reply_text: replyText },
    });
    return data;
  }

  /** Up to 25 replies in one call, with a result per review (never fails as a whole). */
  async bulkReply(replies: { review_id: string; reply_text: string }[], options: RequestOptions = {}): Promise<BulkReplyResult> {
    const { data } = await this.client.request<{ data: BulkReplyResult }>("POST", "/reviews/bulk", { ...options, body: { replies } });
    return data;
  }

  /** Removes the published reply from Google (irreversible). */
  async deleteReply(reviewId: string, options: RequestOptions = {}): Promise<{ review_id: string; deleted: true; no_change: boolean }> {
    const { data } = await this.client.request<{ data: { review_id: string; deleted: true; no_change: boolean } }>("DELETE", `/reviews/${encodeURIComponent(reviewId)}/reply`, options);
    return data;
  }

  /** Totals, rating distribution and 30-day trend of a listing. */
  async stats(listingId: string, options: RequestOptions = {}): Promise<ReviewStats> {
    const { data } = await this.client.request<{ data: ReviewStats }>("GET", "/reviews/stats", { ...options, query: { listing_id: listingId } });
    return data;
  }

  /**
   * AI reply drafts in the listing's language. Saved as drafts in Localnord,
   * nothing is published: send the ones you keep with `reply()`.
   */
  async generateReplies(params: GenerateRepliesParams, options: RequestOptions = {}): Promise<GeneratedReplies> {
    const { data } = await this.client.request<{ data: GeneratedReplies }>("POST", "/reviews/generate-reply", { ...options, body: params });
    return data;
  }
}
