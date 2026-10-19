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
