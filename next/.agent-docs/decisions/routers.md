# Routers are plain objects; `mergeRouters` rejects duplicate keys (human)

- Alex, 2026-10-09 (Q8.2): "helper". Keep a variadic `mergeRouters(a, b, …)` that errors on a shared key, at the type level and at runtime, instead of relying on object spread.
- Why: the spike ([`../notes/contracts-and-routers-typing.md`](../notes/contracts-and-routers-typing.md)) showed `{ ...a, ...b }` silently keeps `b`'s value, and the duplicate is gone at runtime too, so neither types nor the handler can catch it. Spread still works; it just isn't checked.
- Lost: spread only (proposal 08's recommendation).
- (agent, Q8.1) Routers are plain objects. Keys are path segments.
- (agent, Q10.2) The path separator is `.`, in `path` and in URLs (`/trpc/post.byId`).
- Lives in: `packages/trpcdev/src/server/router.ts`.
