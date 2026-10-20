---
title: Should `LazyDef.load()`, the Promise on a lazy router's `~lazy`, be removed?
summary: Nothing calls `load()` on a lazy subtree's `~lazy` any more; removing it leaves only `loadEffect`, and changes the `LazyRouter` type.
area: server
recommended: A
links:
  - kind: decision
    label: lazy-routers-on-effect
    url: ../decisions/lazy-routers-on-effect.md
  - kind: decision
    label: effect-first-public-apis
    url: ../decisions/effect-first-public-apis.md
  - kind: docs
    label: Large routers
    url: https://v12.trpc.io/v12/docs/server/large-routers
  - kind: code
    label: LazyDef, LazyRouter and lazyWith
    url: ../../packages/trpc/src/server/procedures/router.ts
---

# Should `LazyDef.load()`, the Promise on a lazy router's `~lazy`, be removed?

## Why it matters

`lazy(() => import('./admin.ts'))` returns a `LazyRouter`, whose `~lazy` is a `LazyDef` with `loadEffect` (one `Effect.cached` load) and `load()` (`Effect.runPromise` of it). Since the second pass every caller in the package uses `loadEffect`, `resolveProcedure` or `loadRouter`; `load()` has none. `LazyDef` is `@internal` and not exported, but `LazyRouter` is public in `@trpc12/trpc/server` and carries it, so removing `load` changes a type in router declaration, which goes to the human first.

## Options

### A) Keep `load()`

```ts
const appRouter = { admin: lazy(() => import('./admin.ts')) };

// still works, for code that reads the internal key
const admin = await appRouter.admin['~lazy'].load();
// the public Promise path
await loadRouter(appRouter);
```

- ✅ No change to `LazyRouter`, and code reading `~lazy` keeps a Promise
- ❌ A method nothing in the package calls, on a type every lazy router carries

### B) Remove it

`~lazy` keeps `loadEffect`, `meta` and `loaded`. Promise code loads with `loadRouter`.

```ts
const appRouter = { admin: lazy(() => import('./admin.ts')) };

await loadRouter(appRouter); // loads every lazy subtree
// or, from Effect code
const admin = Effect.runPromise(appRouter.admin['~lazy'].loadEffect);
```

- ✅ One way to load a subtree internally, the cached Effect
- ❌ Changes the public `LazyRouter` type for a few bytes, with no user-visible gain
- ❌ Code that read `~lazy` from a Promise has to run `loadEffect` or call `loadRouter`

## Recommendation

**A.** `~lazy` is an internal key and `loadRouter` is the documented Promise path, so removing `load()` saves almost nothing and touches router declaration for it. Leave it until `~lazy` changes for another reason.

## Blocked until answered

- Nothing is blocked.
