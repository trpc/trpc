---
title: Should the OpenAPI and v11 handlers get scoped constructors like `makeFetchHandler`?
summary: Only the v12 handler has a scoped Effect constructor; the OpenAPI and v11 handlers could get `experimental_makeOpenApiHandler` and `makeV11Handler`.
area: effect
recommended: B
links:
  - kind: decision
    label: handler-core-on-effect
    url: ../decisions/handler-core-on-effect.md
  - kind: decision
    label: effect-first-public-apis
    url: ../decisions/effect-first-public-apis.md
  - kind: docs
    label: Node adapter (makeFetchHandler)
    url: https://v12.trpc.io/v12/docs/adapters/node
  - kind: code
    label: makeFetchHandler
    url: ../../packages/trpc/src/server/handler/fetch.ts
  - kind: code
    label: experimental_createOpenApiHandler
    url: ../../packages/trpc/src/openapi/handler.ts
  - kind: code
    label: createV11Handler
    url: ../../packages/trpc/src/interop/handler/handler.ts
---

# Should the OpenAPI and v11 handlers get scoped constructors like `makeFetchHandler`?

## Why it matters

`makeFetchHandler(opts)` is `createFetchHandler` as an `Effect<FetchHandler, never, Scope | services>`: procedures read their services from the layers provided under it, and the scope's end disposes the handler. `experimental_createOpenApiHandler` and `createV11Handler` only have the `create` form, taking a `layer` or a `runtime`. An Effect app serving them has to wrap `dispose()` itself and build their services apart from the app's. `createHandlerCore` already takes built services, so the cost is mostly two exports and their docs.

## Options

### A) Keep it as it is: wrap `create` yourself

```ts
const openapi = Effect.acquireRelease(
  Effect.sync(
    () => experimental_createOpenApiHandler({ router: appRouter, runtime }), // or its own layer
  ),
  (handler) => Effect.promise(() => handler.dispose()),
);

Layer.unwrap(Effect.map(openapi, serve)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
);
```

- ✅ No new API; `[Symbol.asyncDispose]` and `dispose()` cover the lifetime
- ❌ Services come from a `layer` or `runtime` beside the app's layers, not from the layers provided under it
- ❌ The v12 handler and the other two are served differently in the same app

### B) Add `experimental_makeOpenApiHandler` and `makeV11Handler`

Each takes its `create` options without `layer` or `runtime`, reads services from the Effect's context, and disposes the handler when the scope ends.

```ts
const openapi = experimental_makeOpenApiHandler({
  router: appRouter,
  prefix: '/api',
});

Layer.unwrap(Effect.map(openapi, serve)).pipe(
  Layer.provide(AppLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);

const legacy = makeV11Handler({ router: appRouter, transformer: superjson });
```

- ✅ The three handlers have the same two forms
- ✅ An Effect app provides services once, under every handler
- ❌ Two more exports, each with its own options type (`MakeOpenApiHandlerOptions`, `MakeV11HandlerOptions`)
- ❌ No user has asked yet

## Recommendation

**B.** Handlers may be Effect-first ([`effect-first-public-apis.md`](../decisions/effect-first-public-apis.md)), and a scoped constructor is the Effect way to give something a lifetime ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)). Having it on one handler and not the others makes apps that serve several mix two models. The OpenAPI one is `experimental_` like its handler.

## Blocked until answered

- Nothing is blocked. The server-handler worker left them out until an Effect user asks.
