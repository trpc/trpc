# Page loads keep writes made while they ran (agent)

- `fetchNextPage` / `fetchPreviousPage` add the loaded page to the entry's data as of when the page arrives (`fetchPages`' `latest`), not the data the request started with. Live caches (a subscription `setData`-ing loaded pages) lost those writes before.
- If the write moved the end being loaded (its edge page param isn't deeply equal to the one the request started from), the write wins and the loaded page is dropped: appending it would put a page after a list it doesn't follow.
- Full refetches still replace all pages with what they read, like a plain query's request. Merging there would need to know whether a write is newer than the server's read, which the cache can't tell. Writers that know re-write when `isFetching` turns `false`.
- Tests: `packages/react/src/infinite.test.ts` ("add a page to data written while it loaded", "drop a loaded page…").
