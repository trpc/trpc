# Routers

A router is a plain object. Keys are path segments: `{ post: { byId } }` serves `post.byId`, at `/trpc/post.byId` over HTTP.

```ts
export const appRouter = {
  health: t.procedure.query(() => 'ok'),
  post: { byId, create },
};
```

Merge routers with `mergeRouters(a, b)`. A key in both is a type error and a runtime error; object spread would silently keep the last.

## OpenAPI groups

`t.router({ prefix, tags }, routes)` groups routes for OpenAPI. Types and RPC paths don't change, and it takes no middleware.

```ts
const appRouter = {
  admin: t.router({ prefix: '/staff', tags: ['admin'] }, { users, ban }),
};
// RPC: admin.users. OpenAPI: GET /api/staff/users, tagged admin.
```

The prefix goes before every route below the group: before an explicit `.route({ path })`, and before the path derived from the keys below the group. Group tags come before a procedure's own. Groups nest.

## Lazy subtrees

`lazy()` loads a subtree on its first call, for large routers that should start fast (serverless cold starts). The client types it as if it were inline.

```ts
import { lazy } from 'trpcdev/server';

export const appRouter = {
  post: postRouter,
  admin: lazy(() => import('./admin.ts'), { prefix: '/admin' }),
};
```

`load` may return the router or a module whose `default` export is the router. Each subtree loads once.

- The RPC handlers, `createRouterClient` and `localLink` load it on the first call under it.
- Tools that need the whole router ask for it loaded: `generateOpenApi(await loadRouter(appRouter), …)`, `toContract(await loadRouter(appRouter))`.
- The OpenAPI handler finds a lazy subtree's routes by its `prefix` and loads it on the first request under the prefix. Without a prefix it loads the subtree at startup, unless the handler gets a `contract` (below).

With `prefix`, the subtree is scoped like a `t.router({ prefix })` group, so all its OpenAPI routes start with the prefix.

To load nothing until it's called, generate the contract at build time and pass it to the OpenAPI handler:

```ts
// build step
await fs.writeFile(
  'contract.json',
  JSON.stringify(toContract(await loadRouter(appRouter))),
);

// server
createOpenApiHandler({ router: appRouter, contract });
```
