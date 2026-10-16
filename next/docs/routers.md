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

Under the [`openapi()` extension](./openapi.md), `t.router({ meta: { route: { prefix, tags } } }, routes)` groups routes for OpenAPI. Types and RPC paths don't change, and it takes no middleware.

```ts
const t = initTrpc<{ ctx: Context }>().concat(openapi());

const appRouter = {
  admin: t.router(
    { meta: { route: { prefix: '/staff', tags: ['admin'] } } },
    { users, ban },
  ),
};
// RPC: admin.users. OpenAPI: GET /api/staff/users, tagged admin.
```

The prefix goes before every route below the group: before an explicit `.meta({ route: { path } })`, and before the path derived from the keys below the group. Group tags come before a procedure's own. Groups nest.

A router's `meta` takes only the keys an extension gives a router-level form, like `route`; other meta is set on procedures.

## Lazy subtrees

`lazy()` loads a subtree on its first call, for large routers that should start fast (serverless cold starts). The client types it as if it were inline.

```ts
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

```ts
// build step
await fs.writeFile(
  'contract.json',
  JSON.stringify(toContract(await loadRouter(appRouter))),
);

// server
createOpenApiHandler({ router: appRouter, contract });
```

## Contract-first

A contract describes procedures without implementing them. It lives in its own package, and clients and the OpenAPI generator accept it like a router.

```ts
import { contract } from '@trpc12/trpc/contract';

const c = contract.create<{ meta: Meta }>().errors({ UNAUTHORIZED: {} });

export const appContract = {
  post: {
    byId: c.input(ById).output(Post).errors({ NOT_FOUND: {} }).query(),
    create: c.meta({ auth: true }).input(NewPost).output(Post).mutation(),
  },
};
```

`t.implement(contract)` mirrors the contract. Each leaf already has its input, output, errors and route, and offers only `.use()`, `.provide()` and the terminal the contract declares. `impl.router()` checks at the type level and at runtime that every procedure is implemented and nothing else is added.

```ts
const impl = t.implement(appContract).use(authed).provide(Db, () => db);

export const appRouter = impl.router({
  post: {
    byId: impl.post.byId.query(({ input, errors }) => /* … */),
    create: impl.post.create.mutation(({ input }) => /* … */),
  },
});
```

- An implementation may only return errors its contract declares. Middleware passed to `impl.use()` or `impl.provide()` runs for every procedure, so all of them must declare its errors.
- The contract's meta keys must exist in `t`'s meta with types `t` accepts, because middleware reads them as `t`'s meta.
- Top-level contract keys named `router`, `use` or `provide` would shadow the implementer's methods, so `t.implement()` throws on them.
