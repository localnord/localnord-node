import type { Localnord } from "../client.js";
import type { Listing, ListingDetail, RequestOptions, SyncStarted } from "../types.js";

export class ListingsResource {
  constructor(private readonly client: Localnord) {}

  /** Every Google Business Profile listing the key can see (not paginated). */
  async list(options: RequestOptions = {}): Promise<Listing[]> {
    const { data } = await this.client.request<{ data: Listing[] }>("GET", "/listings", options);
    return data;
  }

  /** Full listing, as Google knows it (hours, categories, service area…). */
  async get(listingId: string, options: RequestOptions = {}): Promise<ListingDetail> {
    const { data } = await this.client.request<{ data: ListingDetail }>("GET", `/listings/${encodeURIComponent(listingId)}`, options);
    return data;
  }

  /** Refreshes the listing from Google (details, reviews, stats, photos). 15 min cooldown. */
  async sync(listingId: string, options: RequestOptions = {}): Promise<SyncStarted> {
    const { data } = await this.client.request<{ data: SyncStarted }>("POST", `/listings/${encodeURIComponent(listingId)}/sync`, options);
    return data;
  }
}
