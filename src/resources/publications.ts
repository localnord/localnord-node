import type { Localnord } from "../client.js";
import { paginate } from "../pagination.js";
import type {
  CreatedPublication,
  CreatePublicationParams,
  GeneratedText,
  GenerateSubjectsParams,
  GenerateTextParams,
  Page,
  PostSubject,
  Publication,
  PublicationListParams,
  RequestOptions,
  UpdatedPublication,
  UpdatePublicationParams,
} from "../types.js";

const path = (id: string) => `/publications/${encodeURIComponent(id)}`;

export class PublicationsResource {
  constructor(private readonly client: Localnord) {}

  /** One page of Google posts. */
  list(params: PublicationListParams = {}, options: RequestOptions = {}): Promise<Page<Publication>> {
    return this.client.request<Page<Publication>>("GET", "/publications", { ...options, query: { ...params } });
  }

  /** Every matching post, across pages. */
  listAll(params: Omit<PublicationListParams, "page"> = {}, options: RequestOptions = {}): AsyncGenerator<Publication> {
    return paginate((page) => this.list({ ...params, page }, options));
  }

  /**
   * Creates a post. Scheduled by default (published at the next tick, about a
   * minute); pass `status: "draft"` to keep it in Localnord for review.
   */
  async create(params: CreatePublicationParams, options: RequestOptions = {}): Promise<CreatedPublication> {
    const { data } = await this.client.request<{ data: CreatedPublication }>("POST", "/publications", { ...options, body: params });
    return data;
  }

  /** Edits a post; a published one is updated on Google too. */
  async update(publicationId: string, params: UpdatePublicationParams, options: RequestOptions = {}): Promise<UpdatedPublication> {
    const { data } = await this.client.request<{ data: UpdatedPublication }>("PATCH", path(publicationId), { ...options, body: params });
    return data;
  }

  /** Deletes the post (and removes it from Google when published). */
  async delete(publicationId: string, options: RequestOptions = {}): Promise<{ publication_id: string; deleted: true }> {
    const { data } = await this.client.request<{ data: { publication_id: string; deleted: true } }>("DELETE", path(publicationId), options);
    return data;
  }

  /** Publishes an existing post on Google right away. */
  async publish(publicationId: string, options: RequestOptions = {}): Promise<{ google_post_id: string; published_at: string }> {
    const { data } = await this.client.request<{ data: { google_post_id: string; published_at: string } }>("POST", "/publications/publish", {
      ...options,
      body: { publication_id: publicationId },
    });
    return data;
  }

  /** AI post ideas for a listing (creates nothing). */
  async generateSubjects(params: GenerateSubjectsParams, options: RequestOptions = {}): Promise<PostSubject[]> {
    const { data } = await this.client.request<{ data: { subjects: PostSubject[] } }>("POST", "/publications/generate-subjects", { ...options, body: params });
    return data.subjects;
  }

  /** AI post text in the listing's language (creates nothing). */
  async generateText(params: GenerateTextParams, options: RequestOptions = {}): Promise<GeneratedText> {
    const { data } = await this.client.request<{ data: GeneratedText }>("POST", "/publications/generate-text", { ...options, body: params });
    return data;
  }
}
