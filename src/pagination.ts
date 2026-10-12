import type { Page } from "./types.js";

/** Walks every page of a paginated list, one request per page. */
export async function* paginate<T>(fetchPage: (page: number) => Promise<Page<T>>): AsyncGenerator<T> {
  for (let page = 1; ; page++) {
    const { data, pagination } = await fetchPage(page);
    yield* data;
    if (!pagination || page >= pagination.total_pages || data.length === 0) return;
  }
}
