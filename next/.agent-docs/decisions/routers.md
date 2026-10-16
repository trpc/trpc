# Routers are plain objects; `mergeRouters` rejects duplicate keys (human)

- Human, 2026-10-09 (Q8.2): "helper". Keep a variadic `mergeRouters(a, b, …)` that errors on a shared key, at the type level and at runtime, instead of relying on object spread.
- Why: the spike ([`../notes/contracts-and-routers-typing.md`](../notes/contracts-and-routers-typing.md)) showed `{ ...a, ...b }` silently keeps `b`'s value, and the duplicate is gone at runtime too, so neither types nor the handler can catch it. Spread still works; it just isn't checked.
- Lost: spread only (proposal 08's recommendation).
- Human, 2026-10-15 (Q10.2): "A". The path separator is `.`, in `path` and in URLs (`/trpc/post.byId`). The URL matches the resolver's `path`, and RPC URLs stay distinct from OpenAPI's slash routes (`/api/post/byId`).
- Human, 2026-10-15 (Q8.3): "Yes an openapi only". `t.router({ prefix, tags }, { … })` exists only to group OpenAPI routes. It takes no middleware ([`middleware.md`](./middleware.md): router-level middleware is "never").
- Human, 2026-10-15 (Q8.4): "D". `lazy(() => import('./admin'), { prefix? })` loads a subtree on first use. For OpenAPI, a lazy subtree is found by its `prefix` (the default), by a contract passed to the handler, or else by loading every lazy subtree at startup.
- (agent, Q8.1) Routers are plain objects. Keys are path segments.
- (agent) A group's prefix goes before every route below it: before an explicit `.route({ path })`, and before the path derived from the keys below the group (`admin: t.router({ prefix: '/staff' }, { users })` is `/api/staff/users`). Tags-only groups don't change paths. The group rides on a non-enumerable key, so `Object.keys` and RPC paths don't see it.
- (agent) `lazy(load, { prefix })` scopes its subtree like a group with that prefix, which is what makes the prefix lookup sound. `load` may return the router or a module with a `default` export. The RPC handlers and `localLink` load on the first call (`resolveProcedure`); `generateOpenApi` and `toContract` throw on an unloaded subtree and ask for `await loadRouter(router)`. The contract the OpenAPI handler takes is the `toContract()` JSON, generated at build time.
- Lives in: `packages/trpc/src/server/router.ts`, `packages/trpc/src/internal/describe.ts` (`flattenRoutes`, `scopedRoute`), `packages/trpc/src/openapi/handler.ts`.
