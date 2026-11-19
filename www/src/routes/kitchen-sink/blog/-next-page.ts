/**
 * Whether the list loads its next page when its end scrolls into view. Not
 * while a page loads, and not after one failed: that waits for "Try again",
 * or a list whose server is down would send a request on every render.
 */
export function loadsNextPageOnScroll(query: {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isFetchNextPageError: boolean;
}) {
  return (
    query.hasNextPage &&
    !query.isFetchingNextPage &&
    !query.isFetchNextPageError
  );
}
