---
name: orpc-migrate
description: "Migrate existing codebases to current oRPC, covering tRPC to oRPC (incremental wrapping via the @orpc/trpc integration or a full rewrite with the concept mapping) and oRPC v1 to v2 (package renames, breaking changes, and a safe order of operations). Use when asked to migrate from tRPC to oRPC, convert or wrap a tRPC router, upgrade oRPC v1 to v2, fix oRPC v2 breaking changes, or swap `@trpc/*` packages for `@orpc/*` equivalents. Biases toward retrieval from the oRPC docs over pre-trained knowledge. Not for greenfield oRPC work or new features in an already-migrated codebase: use the orpc skill for those."
license: MIT
---

# Migrating to oRPC

Playbook for two migrations: tRPC to oRPC, and oRPC v1 to v2. Work in small mechanical steps and run the project's typecheck and test suite after each one, so any failure points at the last step. Pretrained knowledge of oRPC describes v1 and is often wrong for v2: derive every import path, builder method, and option name from the docs pages listed at the end, never from memory. For core v2 concepts while rewriting (the `os` builder, routers, middleware, clients), load the `orpc` skill. v2 currently ships under the `beta` npm dist-tag and plain installs get v1; drop the `@beta` suffix once `npm view @orpc/server dist-tags` shows `latest` at 2.x.

## tRPC to oRPC

Two paths. Pick incremental when the app must keep shipping or the tRPC router is large; pick the full rewrite when the router is small enough to convert in one pass.

### Incremental: wrap the existing tRPC router

Install `@orpc/trpc@beta` and convert. The result is a regular oRPC router: expose it through an RPC or OpenAPI handler, or call it with a server-side client, while the tRPC code keeps working untouched.

```ts
import { toORPCRouter } from '@orpc/trpc'

const orpcRouter = toORPCRouter(trpcRouter)
```

- tRPC error formatting is not supported: tRPC errors arrive wrapped in `ORPCError` with the `TRPCError` as `cause` (and a `ZodError` below that for validation failures). Reshape them in a handler interceptor if consumers need structured errors.
- `toTRPCMeta` bridges oRPC `openapi()` metadata into tRPC `.meta()` so converted procedures get OpenAPI routing. Chained tRPC `.meta()` calls merge shallowly, so keep all oRPC metadata inside a single `toTRPCMeta` call.

Then rewrite leaf routers to native oRPC one at a time, mounting each next to the converted router in one plain object.

### Full rewrite: concept map

| Concept           | tRPC                                           | oRPC                           |
| ----------------- | ---------------------------------------------- | ------------------------------ |
| Router            | `t.router({...})`                              | plain object                   |
| Procedure builder | `t.procedure`                                  | `os`                           |
| Context           | `initTRPC.context<T>()`                        | `os.$context<T>()`             |
| Create middleware | `t.middleware(fn)`                             | `os.middleware(fn)`            |
| Use middleware    | `.use(mw)`                                     | `.use(mw)`                     |
| Validation        | `.input(schema)` / `.output(schema)`           | same names                     |
| Implementation    | `.query()` / `.mutation()` / `.subscription()` | `.handler()` for all three     |
| Errors            | `new TRPCError({ code, ... })`                 | `new ORPCError(code, { ... })` |
| Serializer        | `superjson` transformer                        | built in, remove `superjson`   |

Steps, in order, verifying after each:

1. **Packages.** Remove `@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`; install `@orpc/server@beta`, `@orpc/client@beta`, `@orpc/tanstack-query@beta`.
2. **Base file.** Port the context factory unchanged, then rebuild the shared procedures. In handlers and middleware, `ctx` becomes `context`:

   ```ts
   import { ORPCError, os } from '@orpc/server'

   const o = os.$context<Awaited<ReturnType<typeof createContext>>>()

   export const publicProcedure = o.use(timingMiddleware)
   export const protectedProcedure = publicProcedure.use(({ context, next }) => {
     if (!context.session?.user)
       throw new ORPCError('UNAUTHORIZED')
     return next({ context: { session: context.session } })
   })
   ```

3. **Procedures.** Replace `.query`/`.mutation`/`.subscription` with `.handler`; `.input` and `.output` carry over as is.
4. **App router.** Delete every `createTRPCRouter()` wrapper; nested plain objects are the router.
5. **Server.** Replace the tRPC adapter with an oRPC handler for the runtime (fetch shown; other adapters exist for Node, Fastify, AWS Lambda, WebSocket):

   ```ts
   import { RPCHandler } from '@orpc/server/fetch'

   const handler = new RPCHandler(appRouter)

   const { response } = await handler.handle(request, {
     prefix: '/api/orpc',
     context: await createContext({ headers: request.headers }),
   })
   ```

6. **Client.** `RPCLink` plus `createORPCClient`, typed by `RouterClient`. Call sites drop the `.query()`/`.mutate()` suffixes:

   ```ts
   import type { RouterClient } from '@orpc/server'
   import { createORPCClient } from '@orpc/client'
   import { RPCLink } from '@orpc/client/fetch'

   const link = new RPCLink({ origin: 'http://localhost:3000', url: '/api/orpc' })
   export const client: RouterClient<typeof appRouter> = createORPCClient(link)

   const { planets } = await client.planet.list({ cursor: 0 })
   ```

7. **TanStack Query.** `createTanstackQueryUtils(client)` replaces the provider and `useTRPC` hook entirely; use the utils object directly. Input moves inside an `input` key: `orpc.planet.list.queryOptions({ input: { cursor: 0 } })`, `orpc.planet.create.mutationOptions()`. For infinite queries, `infiniteOptions` takes `input` as a function of the page param.

## oRPC v1 to v2

Most v1 names still compile through deprecated aliases (strike-through hints, not errors), so migrate in passes. Order of operations:

1. **Update packages.** Install every `@orpc/*` package from the `beta` dist-tag (`npm install @orpc/server@beta @orpc/client@beta`, and so on). Swap renamed ones first: `@orpc/react-query`/`@orpc/vue-query`/`@orpc/solid-query`/`@orpc/svelte-query` all became `@orpc/tanstack-query`; `@orpc/openapi-client` merged into `@orpc/openapi`; `@orpc/react` became `@orpc/next`; `@orpc/otel` became `@orpc/opentelemetry`; the `experimental-` packages were promoted (`@orpc/publisher`, `@orpc/ratelimit`, `@orpc/pino`, `@orpc/swr`); `@orpc/vue-colada` became `@orpc/pinia-colada`. Typecheck: the remaining errors are the hard breaks.
2. **Fix the hard breaks** (no aliases):
   - Routing: `.route`, `.prefix`, `.tag`, `.$route` are gone from the builder. Use `.meta(openapi({ method, path, prefix, tags }))` from `@orpc/openapi`, or restore `.route` with `import '@orpc/openapi/extensions/route'`.
   - `.callable` and `.actionable`: use `call`/`createRouterClient` from `@orpc/server` and `createServerFunctionable` from `@orpc/next`, or the corresponding extension imports.
   - `RPCLink`: the single `url` split into `origin` plus a path-only `url`.
   - Errors: `status` was removed from `ORPCError` and `.errors` definitions; map codes to HTTP status with `errorStatusMap` on the handler.
   - `safe()`: the third tuple element is now the typed error itself (or `null`) and a fourth `isSuccess` element was added.
   - Option renames, scoped: handler `rootInterceptors` to `routingInterceptors` (handler `clientInterceptors` still exists, unchanged); link `clientInterceptors` to `transportInterceptors`. Flat `eventIterator*` options moved under the adapter's request/response mapping: `toFetchResponse.eventStream` on the fetch handler, `sendStandardResponse.eventStream` on Node, `toFetchRequest.eventStream` on the link.
   - `adapterInterceptors` was removed from handlers and links, because regular interceptors can now customize body parsing behavior.
3. **Audit silent behavior changes** (compile fine, behave differently):
   - **Wire format changed:** a v1 link cannot talk to a v2 server, in either direction. Deploy the upgraded server and clients together.
   - **Automatic middleware deduplication removed:** middleware applied at both router and procedure level now runs twice, with no warning. Guard shared middleware with the context-flag pattern from the dedupe-middleware recipe.
   - **Batch Plugin `exclude` became `filter` with the opposite meaning.** Usually delete `exclude`; if skipping is still needed, negate the predicate.
   - **`RPCHandler` rejects GET by default** (`allowMethods` defaults to POST/PUT/PATCH/DELETE). Simplest fix: stop sending GET from the link; only allow GET deliberately, with CSRF protection.
   - **Handler `filter` takes positional arguments now;** the v1 destructured form still type-checks but reads wrong values.
   - **`.input`/`.output` now stack:** a repeated call adds a schema instead of replacing the previous one.
4. **Sweep deprecated aliases** last: `eventIterator` to `asyncIteratorObject`, handler plugins gained a `HandlerPlugin` suffix and link plugins a `LinkPlugin` suffix, `ContractRouter*` types became `RouterContract*`. The from-v1 guide ends with the full alias cheat sheet.

Verification: typecheck and unit tests after steps 1, 2, and 4; step 3 needs integration or e2e tests, since those changes never surface at compile time. Before finishing, grep for old package names and remaining deprecation strike-throughs.

## Docs retrieval

Fetch pages instead of recalling them, and if this skill and a fetched page disagree, trust the page. The v2 docs live at https://orpc.dev and the v1 docs at https://v1.orpc.dev; slugs look alike across both hosts, so check which host a page came from before copying anything from it. The index of every v2 docs page is at https://orpc.dev/llms.txt, https://orpc.dev/llms-full.txt bundles the entire docs in one large file, and appending `.md` to any page URL returns its exact source markdown.

Authoritative pages to consult during the migration (this skill deliberately omits their full mapping tables):

- https://orpc.dev/docs/migrations/from-trpc : side-by-side tRPC/oRPC code for every step, including server setup per framework
- https://orpc.dev/docs/migrations/from-v1 : every v2 breaking change with v1/v2 comparisons, package rename table, and the deprecated alias cheat sheet
- https://orpc.dev/docs/integrations/trpc : `toORPCRouter` and `toTRPCMeta` reference for the incremental path
