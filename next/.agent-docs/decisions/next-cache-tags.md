# Next.js data-cache tags come from query keys (agent)

- (agent) For issue #4829 and the "worth considering" in `notes/open-issues-review.md`. `cacheTags(key)` and `revalidationTag(key)` in `@trpc12/tanstack-query` (re-exported by every framework package) turn a tRPC query key into string tags. No Next import: the app passes them to `next/cache`'s `cacheTag` and `revalidateTag`.
- (agent) Tags mirror TanStack's partial matching: `trpc`, then each path prefix (`trpc:post`, `trpc:post.byId`), then path plus input (`trpc:post.byId:{"id":"1"}`). The input part is TanStack's `hashKey`, so key order doesn't matter, the same rule as canonical GET URLs ([`wire-protocol.md`](./wire-protocol.md)). A function tagged with all of them is revalidated by any level, so `revalidateTag(revalidationTag(trpc.post.pathKey()))` is the cache's `invalidateQueries({ queryKey: trpc.post.pathKey() })`.
- (agent) Inputs whose tag would pass Next's 256-character limit get no input tag and revalidate with their path. Over-invalidating is safe; hashing would add a dependency for a rare case.
- (agent) Keys come from the TanStack helpers (`trpc.x.queryKey()`, `pathKey()`, from `createTrpcRsc` on the server) rather than from router objects, because procedures don't know their path until a router places them.
- Why: one key hierarchy for the browser cache and the server data cache, and nothing Next-specific to keep in step with `'use cache'`, which is still changing.
- Lost: automatic tagging of every server call; apps tag the cached functions they write.
- Lives in: `packages/tanstack-query/src/keys.ts` (`cacheTags`, `revalidationTag`), `test/tanstack-query/cache-tags.test.ts`, `docs/actions-and-rsc.md` (Next.js data cache).
