---
title: Routers
description: Plain objects of procedures, merged with mergeRouters and split with lazy().
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

Merge routers with `mergeRouters(a, b)`. A key in both is a type error and a runtime error; object spread would silently keep the last.

For OpenAPI, `t.router({ meta }, routes)` groups routes under a prefix and tags without changing their types or RPC paths ([Groups](../openapi/routes.md#groups-and-lazy-subtrees)).

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

`t.lazy(load, { meta })` also takes router-level meta, as `t.router()` does: `t.lazy(() => import('./admin.ts'), { meta: { route: { prefix: '/admin' } } })`.

`load` may return the router or a module whose `default` export is the router. Each subtree loads once.

- The RPC handlers, `createRouterClient` and `localLink` load it on the first call under it.
- Tools that need the whole router ask for it loaded: `generateOpenApi(await loadRouter(appRouter), …)`, `toContract(await loadRouter(appRouter))`.
- The OpenAPI handler finds a lazy subtree's routes by its `route.prefix` and loads it on the first request under the prefix. Without a prefix it loads the subtree at startup, unless the handler gets a `contract` (below).

With `route` meta, the subtree is scoped like a group, so all its OpenAPI routes start with the prefix.

To load nothing until it's called, generate the contract at build time and pass it to the OpenAPI handler:

```ts twoslash
// ---cut-start---
import * as fs from 'node:fs/promises';
import type { ContractJson } from '@trpc12/trpc/contract';
import { toContract } from '@trpc12/trpc/contract';
import { createOpenApiHandler } from '@trpc12/trpc/openapi';
import { initTrpc, loadRouter } from '@trpc12/trpc/server';
const t = initTrpc();
const appRouter = { health: t.procedure.query(() => 'ok') };
declare const contract: ContractJson<typeof appRouter>;
// ---cut-end---
// build step
await fs.writeFile(
  'contract.json',
  JSON.stringify(toContract(await loadRouter(appRouter))),
);

// server
createOpenApiHandler({ router: appRouter, contract });
```
