# What each verb waits for

- **Three distinct verbs, matching TanStack Query** (human-picked, 2026-10-13). `prefetch` never waits (`prefetchQuery`, not awaited). `ensure` waits on a cache miss only; stale data resolves at once and revalidates in the background (`ensureQueryData({ revalidateIfStale: true })`). `fetch` also waits on stale data (`fetchQuery`).
- One rule decides "stale" for both the background refetch and `fetch`'s wait: `Entry.needsRefetch`. On a server cache that's only `isInvalidated` (see `server-verbs-no-revalidate.md`), so `fetch` then `ensure` in a server component is still one request.
- Before this, `fetch` behaved like `ensure`, which left no reason to pick one over the other beyond the return type.
- The table at the top of `www/content/starting-queries.md` is the summary of the differences; keep it in sync.
