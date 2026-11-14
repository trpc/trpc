/** The pages trpc.io has besides the docs, the blog and the sponsors'. */

/** tRPC's logos and colour, for press and the sites that write about it. */
export const mediaPage = {
  description:
    "tRPC's logo and wordmark, light and dark, with its colour: for press, talks and the sites that write about it.",
  path: '/media',
  title: 'Media assets',
} as const;

/**
 * Search results at their own URL, `/search?q=`, which browsers' search
 * bars use (`/opensearch.xml`).
 */
export const searchPage = {
  description: "Search tRPC's docs.",
  path: '/search',
  title: 'Search',
} as const;

/**
 * The query parameter `/search` reads, as trpc.io's did. On any other page
 * it opens the search dialog on it, so a search is a link anywhere.
 */
export const searchParam = 'q';

export interface QuerySearch {
  readonly q?: string | undefined;
}

/**
 * `?q=`, if it's there and not empty. The router parses `?q=404` as a
 * number; it's still what was searched for. Anything else (`?q=null`,
 * `?q=[1]`) is `undefined`, said out loud: the router lays what this returns
 * over what the URL said, so a key left out keeps the URL's value.
 */
export function validateQuerySearch(
  search: Record<string, unknown>,
): QuerySearch {
  const query = search[searchParam];
  const text =
    typeof query === 'number' || typeof query === 'boolean'
      ? String(query)
      : query;
  return { q: typeof text === 'string' && text !== '' ? text : undefined };
}
