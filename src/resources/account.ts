import type { Localnord } from "../client.js";
import type { Account, RequestOptions } from "../types.js";

export class AccountResource {
  constructor(private readonly client: Localnord) {}

  /** Organization, subscription, credits and today's quotas. */
  async get(options: RequestOptions = {}): Promise<Account> {
    const { data } = await this.client.request<{ data: Account }>("GET", "/account", options);
    return data;
  }
}
