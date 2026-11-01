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

/** The query parameter `/search` reads, as trpc.io's did. */
export const searchParam = 'q';
