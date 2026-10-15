# 08 — Routers

| Status     | Area   | Depends on | oRPC parity rows             |
| ---------- | ------ | ---------- | ---------------------------- |
| `proposed` | server | 03, 04     | Lazy router, OpenAPI support |

## Summary

Decide how routers are defined, merged and lazily loaded, and which router-level options exist.

**Recommendation:**

- Plain objects are routers everywhere. They are validated once when the handler or client is created.
- `t.router()` is optional and only adds route defaults (prefix, tags).
- Keep `lazy()`.
- Delete `mergeRouters` in favour of object spread.

## Today (v11)

- `t.router({ … })` is required at every level in docs, though nested plain objects are accepted.
- Routers are flattened into a `procedures` record at construction time. The type is `BuiltRouter<TRoot, TDecoration>`.
- Reserved words (`then`, `call`, `apply`, …) and duplicate keys are checked at runtime.
- `t.mergeRouters(a, b)` and `lazy(() => import('./x'))` exist. `lazy` supports default and named exports.
- The router carries the root config (`_def._config`). That is how a client knows the transformer, and it ties router types to one `initTRPC`.

## Goals

- Less ceremony: a router is "an object of procedures and routers".
- Router types do not carry root config (transport options move to endpoints; see 11 and 12).
- Lazy loading works for RPC and for OpenAPI routing.
- Router-level route defaults for OpenAPI (prefix, tags).

## Options

### A — Plain objects, optional `t.router()` for defaults

```ts
export const appRouter = {
  health: t.procedure.query(() => 'ok'),
  post: postRouter, // plain object or t.router()
  admin: lazy(() => import('./admin')), // lazy subtree
  billing: t.router(billingRoutes, { prefix: '/billing', tags: ['billing'] }),
};
export type AppRouter = typeof appRouter;
```

- Validation of reserved words and duplicate paths, plus flattening into a lookup table, happens in `createHandler()` / `createRouterClient()`.
- ✅ Minimal API, nice hovers, trivially composable.
- ❌ Typos (for example a non-procedure value in the tree) are caught at handler creation, not when the router is defined. Types catch most of them anyway.

### B — Keep mandatory `t.router()`

```ts
export const appRouter = t.router({
  health: t.procedure.query(() => 'ok'),
  post: postRouter, // itself a t.router({ … })
  admin: lazy(() => import('./admin')),
  billing: t.router(billingRoutes, { prefix: '/billing', tags: ['billing'] }),
}); // validated and flattened here
export type AppRouter = typeof appRouter;
```

- ✅ Familiar. Errors surface early.
- ❌ More ceremony. It keeps the router as an opaque built object, and lazy plus prefix logic stays in the builder.

## Details

- **Merging:** use object spread (`{ ...a, ...b }`). Duplicate keys are a type error through a `Router` constraint helper and are checked at runtime.
  - **Decided ([routers](../decisions/routers.md)):** keep a merge helper that rejects duplicate keys; spread can't detect them.

  ```ts
  // v11: t.mergeRouters(postRouter, userRouter)
  export const appRouter = { ...postRouter, ...userRouter };
  // a key present in both: type error, and createHandler() throws
  ```

- **Lazy:**
  - `lazy(() => import('./admin'))` accepts default or named exports.
  - For OpenAPI routing without loading every lazy subtree, a lazy router may declare a `prefix` (as oRPC requires), or the handler may be given a minified contract (09).

  ```ts
  export const appRouter = {
    admin: lazy(() => import('./admin')), // default export, or a single named export
    reports: lazy(() => import('./reports').then((m) => m.reportsRouter)),
    // OpenAPI, prefix: requests outside /billing never load the subtree
    billing: lazy(() => import('./billing'), { prefix: '/billing' }), // option shape TBD
  };

  // OpenAPI, contract: routes come from a minified contract (09), subtrees load on demand
  createOpenAPIHandler({ router: appRouter, contract: appContract }); // option name TBD
  ```

  oRPC's form of the prefixed lazy router is `os.prefix('/billing').lazy(() => import('./billing'))`.

- **Router options:** `{ prefix?: string; tags?: string[] }` only. Middleware is not a router option (06 (e)).
- **Reserved keys:** keep the v11 runtime check. Also reserve keys starting with `~` (our def namespace).
- **Inference helpers:** `inferRouterInputs`, `inferRouterOutputs` and `inferRouterErrors` (07), plus `inferContract<typeof router>` (01, 09).

> **Spike (2026-10-09):** [`notes/contracts-and-routers-typing.md`](../notes/contracts-and-routers-typing.md).
>
> - Object spread can't detect duplicate keys, at the type level or at runtime. `{ ...a, ...b }` silently keeps `b`'s value, and the duplicate is gone before `createHandler()` sees it. The "Merging" bullet above therefore needs a variadic merge helper (prototyped) or has to accept silent overwrites.
> - `lazy()` with default or named exports, and the client unwrapping it, both type fine.

## Recommendation

**Option A.** `mergeRouters` goes; `lazy` stays; router options are limited to route defaults.

## Questions for Alex

- **Q8.1** Plain objects as routers (A), or mandatory `t.router()` (B)?
- **Q8.2** Delete `mergeRouters` in favour of object spread?
- **Q8.3** Router options limited to `prefix` and `tags` (no middleware)?
- **Q8.4** OpenAPI with lazy routers: require a `prefix` on lazy routers, accept a contract, or load everything at startup?

## Decision

- **Q8.1:** [ ] A · [ ] B
- **Q8.2:** [ ] yes · [x] no (keep a merge helper) → [routers](../decisions/routers.md)
- **Q8.3:** [x] yes, OpenAPI only · [ ] no → [routers](../decisions/routers.md)
- **Q8.4:** [ ] prefix · [ ] contract · [ ] eager load · [x] any of these, `prefix` by default → [routers](../decisions/routers.md)
- **Notes:**
