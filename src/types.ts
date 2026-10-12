// Response shapes of the Localnord API v1. Fields follow the public reference
// (https://app.localnord.io/api/v1/docs.md); the API may add fields at any time,
// so treat these as a floor, not a ceiling.

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/** `{ data, pagination }` envelope of paginated lists. */
export interface Page<T> {
  data: T[];
  pagination: Pagination;
}

export interface PageParams {
  /** 1-based page number (default 1). */
  page?: number;
  /** 1 to 100 (default 50). */
  per_page?: number;
}

export interface Quota {
  limit: number;
  used: number;
  remaining: number;
  reset_at: string;
}

export interface Account {
  organization: { id: string; name: string };
  subscription: {
    status: string | null;
    access: "subscription" | "trial" | "credits" | string;
    listing_count: number;
    is_trial: boolean;
    trial_ends_at: string | null;
  };
  credits: { balance: number };
  quotas: { api_requests: Quota; audits: Quota; prospects: Quota };
}

export interface Listing {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  description: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  status: string;
  paused: boolean;
  created_at: string;
}

export interface ListingDetail extends Listing {
  default_language: string | null;
  google_review_link: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string;
  [field: string]: unknown;
}

export interface SyncStarted {
  run_id: string | null;
  status: "running" | "skipped";
  reason?: "cooldown";
  next_sync_at?: string;
}

export interface Review {
  id: string;
  listing_id: string;
  google_review_id: string | null;
  author_name: string | null;
  rating: number;
  comment: string | null;
  reply: string | null;
  replied_at: string | null;
  published_at: string | null;
  updated_at: string;
}

export interface ReviewListParams extends PageParams {
  /** Omit to list every listing the key can see. */
  listing_id?: string;
  filter?: "unreplied" | "negative";
  from_date?: string;
  to_date?: string;
  min_rating?: number;
  max_rating?: number;
  /** ISO 8601: incremental sync, sorted by `updated_at` ascending. */
  updated_since?: string;
}

export interface ReviewStats {
  total: number;
  replied: number;
  unreplied: number;
  average_rating: number | null;
  by_rating: Record<"1" | "2" | "3" | "4" | "5", number>;
  monthly: Record<string, number>;
  last30: number;
  prev30: number;
  trend: number;
}

export type Tone = "professional" | "warm" | "premium";

export interface GenerateRepliesParams {
  listing_id: string;
  /** 1 to 20 (default 10). */
  max_reviews?: number;
  reply_state?: "all" | "unreplied" | "drafted";
  sort?: "auto" | "oldest_first" | "newest_first" | "lowest_rating_first" | "highest_rating_first";
  tone?: Tone;
  filters?: { minRating?: number; maxRating?: number; unrepliedSinceDays?: number; requireComment?: boolean };
}

/** AI reply draft. Saved as a draft in Localnord, never published by this call. */
export interface ReplyDraft {
  reviewId: string;
  replyDraft: string;
  length: number;
  truncated: boolean;
  rating: number;
  is_anonymous: boolean;
  /** `rating <= 2`: worth a human look before publishing. */
  is_negative: boolean;
  /** Google policy warnings (URL, price, emoji detected in the reply). */
  validation_warnings: string[];
  age_days: number | null;
}

export interface GeneratedReplies {
  drafts: ReplyDraft[];
  skipped: { reviewId: string; reason: string }[];
  total_unreplied: number;
  remaining_unreplied: number;
  partial: boolean;
  language: string;
  tone: Tone;
}

export interface BulkReplyResult {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  results: { review_id: string; success: boolean; skipped?: boolean; error?: string }[];
}

export type PostType = "news" | "offer" | "event";
export type PublicationStatus = "draft" | "scheduled" | "pending_review" | "published" | "failed";
export type RedirectType = "phone" | "website" | "custom_url" | "book" | "order" | "shop" | "learn_more" | "sign_up" | "call";

export interface Publication {
  id: string;
  listing_id: string;
  subject: string;
  text: string;
  post_type: PostType;
  status: PublicationStatus;
  scheduled_at: string | null;
  published_at: string | null;
  image_url: string | null;
  redirect_type: RedirectType | null;
  redirect_value: string | null;
  start_date: string | null;
  end_date: string | null;
  google_post_url: string | null;
  error_message: string | null;
  external_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicationListParams extends PageParams {
  listing_id?: string;
  status?: PublicationStatus;
  updated_since?: string;
  external_id?: string;
}

export interface CreatePublicationParams {
  listing_id: string;
  /** Up to 200 characters. */
  subject: string;
  /** Up to 1500 characters. Google rejects posts that contain a phone number. */
  text: string;
  post_type?: PostType;
  /** `draft` keeps it in Localnord; default `scheduled` publishes at the next tick. */
  status?: "draft" | "scheduled";
  scheduled_at?: string;
  /** Must be https. */
  image_url?: string;
  redirect_type?: RedirectType;
  redirect_value?: string;
  /** `YYYY-MM-DD`, required for `offer` and `event`. */
  start_date?: string;
  end_date?: string;
  /** Your own identifier, returned as is (never sent to Google). */
  external_id?: string;
}

export type UpdatePublicationParams = Partial<Omit<CreatePublicationParams, "listing_id" | "image_url">> & {
  /** `null` removes the image. */
  image_url?: string | null;
};

/** Fields returned by `publications.create()`. */
export type CreatedPublication = Pick<
  Publication,
  "id" | "subject" | "status" | "scheduled_at" | "image_url" | "redirect_type" | "redirect_value" | "start_date" | "end_date" | "created_at"
> & { external_id: string | null };

/** Fields returned by `publications.update()`. */
export type UpdatedPublication = Omit<Publication, "listing_id" | "published_at" | "error_message"> & {
  google_post_id: string | null;
  google_state: string | null;
};

export interface GenerateTextParams {
  listing_id: string;
  subject: string;
  post_type?: PostType;
  /** 1 to 3 (default 1). */
  variations?: number;
  tone?: Tone;
  start_date?: string;
  end_date?: string;
}

export interface GeneratedText {
  texts: { text: string }[];
  /** Set when the model needs a fact (date, price…); `texts` is then empty. */
  needs_validation: string | null;
}

export interface GenerateSubjectsParams {
  listing_id: string;
  /** 1 to 20 (default 5). */
  count?: number;
  tone?: Tone;
  mix?: Partial<Record<PostType | "alert", number>>;
}

export interface PostSubject {
  subject: string;
  post_type: PostType | "alert";
  angle: string | null;
  summary_short: string;
  cta_suggestion: string | null;
  needs_validation: boolean;
  validation_reason: string | null;
  score: number;
  [field: string]: unknown;
}

/** Options accepted by every call. */
export interface RequestOptions {
  /**
   * Replay-safe key (1 to 200 printable ASCII characters, kept 24 h). Sent as
   * `Idempotency-Key` on the endpoints that publish to Google or spend credits;
   * also makes the call retryable. Reusing a key with a different body is a `409`.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}
