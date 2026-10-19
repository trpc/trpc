---
title: Routers
description: Plain objects of procedures, merged with `mergeRouters` and split with `lazy()`.
section: Server
order: 2
---

A router is a plain object. Keys are path segments: `{ post: { byId } }` serves `post.byId`, at `/trpc/post.byId` over HTTP.

```ts twoslash
// ---cut-start---
import { appRouter as blog, t } from './server.ts';
const byId = blog.post.byId;
const create = blog.post.create;
// ---cut-end---
export const appRouter = {
  health: t.procedure.query(() => 'ok'),
  post: { byId, create },
};
```

Two kinds of key can't be called from a client, so `createFetchHandler` and `createRouterClient` throw on them (and a lazy subtree throws when it loads): `then`, because clients and their nested routers can be awaited, and a key with a `.`, which separates path segments (nest it instead: `{ post: { byId } }`).

Merge routers with `mergeRouters(a, b)`. A key in both is a type error and a runtime error; object spread would silently keep the last.

Router-level `meta` (`t.router({ meta }, routes)`, like an OpenAPI group's `route`) merges too: the result has every `meta` key of its routers, so every procedure in it is under that `meta`, as if the routers had been written as one. Two routers setting a key to different values make `mergeRouters` throw, naming the key; equal values (compared structurally) are fine. Nest them under keys of their own instead, so each keeps its `meta`. Object spread drops router-level `meta`.

```ts twoslash
// ---cut-start---
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { initTrpc, mergeRouters } from '@trpc12/trpc/server';
const t = initTrpc().concat(experimental_openapi());
const users = t.procedure.query(() => ['ada']);
const invoices = t.procedure.query(() => [1]);
const health = t.procedure.query(() => 'ok');
// ---cut-end---
const admin = t.router({ meta: { route: { prefix: '/admin' } } }, { users });
const billing = t.router(
  { meta: { route: { prefix: '/billing' } } },
  { invoices },
);

// OpenAPI: GET /api/admin/users and GET /api/admin/health
export const adminApi = mergeRouters(admin, { health });

// mergeRouters(admin, billing) throws: they set `route` to different values.
export const appRouter = { admin, billing, health };
```

The type check doesn't see router-level `meta`, so a conflict is a runtime error only.

With thousands of procedures, split the router into packages and type apps from the server's built declarations: see [Large routers](./large-routers.md).

## Lazy subtrees

`lazy()` loads a subtree on its first call, for large routers that should start fast (serverless cold starts). The client types it as if it were inline.

```ts twoslash
// ---cut-start---
// @filename: admin.ts
import { t } from './server.ts';
export default { stats: t.procedure.query(() => 0) };
// @filename: index.ts
import { appRouter as blog } from './server.ts';
const postRouter = blog.post;
// ---cut-end---
import { lazy } from '@trpc12/trpc/server';

export const appRouter = {
  post: postRouter,
  admin: lazy(() => import('./admin.ts')),
};
```

`t.lazy(load, { meta })` also takes router-level `meta`, as `t.router()` does.

`load` may return the router or a module whose `default` export is the router. Each subtree loads once.

- The RPC handlers, `createRouterClient` and `localLink` load it on the first call under it.
- Tools that need the whole router ask for it loaded: `await loadRouter(appRouter)`.
