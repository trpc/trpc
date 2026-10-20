---
title: API changes
description: 'Each v11 API next to its v12 form: init, errors, transformers, handlers, adapters, clients, links, callers and subscriptions.'
section: Migrations
parent: migrations/from-v11
order: 4
---

What each v11 API is in v12. [The codemod](./codemod.md) rewrites the ones with one v12 form and lists the rest.

| v11                                                                | v12                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@trpc/server`, `@trpc/client`                                     | `@trpc12/trpc/server`, `@trpc12/trpc/client`                                                                                                                             |
| `initTRPC.context<Ctx>().meta<Meta>().create()`                    | `initTrpc<{ ctx: Ctx; meta: Meta }>()`                                                                                                                                   |
| `t.router({ … })`, `t.mergeRouters(a, b)`                          | a plain object, `{ ...a, ...b }` (`router()` and `mergeRouters()` still exist)                                                                                           |
| `throw new TRPCError({ code })`                                    | `return error({ code })`, which types it on the client; a thrown `TrpcError` is untyped and warns in development ([Thrown errors](../../server/errors.md#thrown-errors)) |
| `create({ errorFormatter })`                                       | declared errors (`.errors()`, `TrpcError.Tagged`) with typed `data`                                                                                                      |
| `create({ transformer: superjson })` and each link's `transformer` | `serializer` on the handler and every link; plain JSON by default, danSON with `createSerializer()` (Dates, Maps, BigInts, files)                                        |
| `fetchRequestHandler({ endpoint, req, router, createContext })`    | `createFetchHandler({ endpoint, router, createContext }).fetch(req)`                                                                                                     |
| `createContext({ req, resHeaders })`                               | `createContext({ request, info })`; headers go on the procedure's `response` handle                                                                                      |
| adapters (standalone, express, next, aws-lambda, ws)               | one handler: see [Adapters](../../adapters/overview.md)                                                                                                                  |
| `createTRPCClient<AppRouter>({ links })`                           | `createTrpcClient({ router: routerType<AppRouter>(), links })`                                                                                                           |
| `httpBatchLink`, `httpBatchStreamLink`, `httpSubscriptionLink`     | `httpLink({ url, batch: batching(), subscriptions: sse() })`, which streams too                                                                                                              |
| `createWSClient` + `wsLink({ client })`                            | `wsLink({ url })`                                                                                                                                                        |
| `TRPCClientError`                                                  | `TrpcError`; `safe()` for `[data, error]`                                                                                                                                |
| `inferRouterOutputs<AppRouter>` with a `transformer`               | `inferRouterOutputs<typeof client>`, which follows the client's serializer; `inferRouterOutputs<AppRouter>` is plain JSON's form, as v11's without a transformer         |
| `t.createCallerFactory(router)(ctx)`                               | `createRouterClient(router, { ctx })`                                                                                                                                    |
| subscriptions returning `observable()`                             | an async generator or an Effect `Stream`                                                                                                                                 |
| `input.lastEventId` in a subscription                              | the resolver's `lastEventId` option                                                                                                                                      |
| `.subscribe(input, { onData, onError })`                           | `for await (const event of client.x.subscribe(input))`                                                                                                                   |
| `@trpc/react-query`, `@trpc/tanstack-react-query`                  | `@trpc12/tanstack-react-query`                                                                                                                                           |
| `abortOnUnmount: true`                                             | always on: queries pass TanStack's `signal`, so one nothing observes is cancelled                                                                                        |
