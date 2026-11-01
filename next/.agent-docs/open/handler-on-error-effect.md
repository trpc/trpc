---
title: Should a handler's `onError` be allowed to return an `Effect`?
summary: Handlers' `onError` is a synchronous callback; it could return an `Effect` run in the request's fiber, or errors could go to Effect's logger.
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
    label: Server errors
    url: https://v12.trpc.io/v12/docs/server/errors
  - kind: code
    label: OnErrorOpts and onError
    url: ../../packages/trpc/src/server/handler/fetch.ts
  - kind: code
    label: report in the handler core
    url: ../../packages/trpc/src/server/handler/core.ts
---

# Should a handler's `onError` be allowed to return an `Effect`?

## Why it matters

`onError: (opts: OnErrorOpts) => void` on `createFetchHandler`, the OpenAPI and v11 handlers gets every error with its original cause (`error`, `path`, `type`, `request`). An Effect app that reports errors through a service (telemetry, an error store) can't reach the handler's services from it, and what it starts isn't tied to the request. The second pass kept it a callback because `report` is called synchronously, outside the request's fiber, on the socket, v11 and OpenAPI paths, so an Effect hook there would lose the spans and annotations that would make it worth being one.

## Options

### A) Keep it as it is: a synchronous callback

Effect users report from an Effect middleware with `Effect.tapError`, or from the tracer.

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { Effect } from 'effect';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
declare const Sentry: {
  captureException: (error: unknown, hint: { extra: object }) => void;
};
// ---cut-end---
const handler = createFetchHandler({
  router,
  onError: ({ error, path }) => {
    Sentry.captureException(error.cause ?? error, { extra: { path } });
  },
});

// Effect users, per procedure chain
const reported = t.middleware.effect()((opts) =>
  opts
    .next()
    .pipe(Effect.tapError((error) => Effect.logError(opts.path, error))),
);
```

- ✅ Nothing changes; the same callback on every path
- ❌ A middleware doesn't see errors from outside procedures: a missing procedure, a bad body, `createContext`
- ❌ No services from the handler's `layer` or `runtime` in `onError`

### B) `onError` may return an `Effect`

It runs in the request's fiber (or the socket call's), with the handler's services and the call's span. Returning nothing works as today.

```ts twoslash
// ---cut-start---
import { initTrpc, type AnyTrpcError } from '@trpc12/trpc/server';
import { Context, Effect, Layer } from 'effect';
import { createFetchHandlerB as createFetchHandler } from '../open/handler-on-error-effect.ts';
class Db extends Context.Service<Db, { ping: Effect.Effect<string> }>()('Db') {}
declare const AppLive: Layer.Layer<Db>;
class Telemetry extends Context.Service<
  Telemetry,
  {
    capture: (
      error: AnyTrpcError,
      extra: { path: string | undefined },
    ) => Effect.Effect<void>;
  }
>()('Telemetry') {
  declare static readonly layer: Layer.Layer<Telemetry>;
}
const t = initTrpc();
const router = t.router({
  health: t.procedure.query(() =>
    Effect.gen(function* () {
      return yield* (yield* Db).ping;
    }),
  ),
});
// ---cut-end---
const handler = createFetchHandler({
  router,
  layer: Layer.mergeAll(AppLive, Telemetry.layer),
  onError: ({ error, path }) =>
    Effect.gen(function* () {
      yield* (yield* Telemetry).capture(error, { path });
    }),
});
```

- ✅ One hook for every error, with the services and span of the request it came from
- ✅ Promise users write what they write today
- ❌ `report` must first run inside the request's fiber on the socket, v11 and OpenAPI paths, which is a refactor across the handler and socket code
- ❌ `onError`'s requirements must join what the `layer` or `runtime` provides, one more type parameter on each handler

### C) Errors go to Effect's logger

The handler logs each reported error with `Effect.logError` in the request's fiber, annotated with `path` and `type`. `onError` stays the Promise users' callback.

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { Context, Effect, Layer, Logger } from 'effect';
class Db extends Context.Service<Db, { ping: Effect.Effect<string> }>()('Db') {}
declare const AppLive: Layer.Layer<Db>;
const t = initTrpc();
const router = t.router({
  health: t.procedure.query(() =>
    Effect.gen(function* () {
      return yield* (yield* Db).ping;
    }),
  ),
});
// ---cut-end---
const handler = createFetchHandler({
  router,
  layer: Layer.mergeAll(AppLive, Logger.layer([Logger.consoleJson])),
});
```

- ✅ No new hook: Effect apps route errors with the logger and tracer they already configure
- ❌ Every app's default logger starts printing handler errors, which v11 never did
- ❌ Two places errors go, and reporting to a service still needs a custom `Logger`

## Recommendation

**B.** It keeps one hook, gives Effect apps the services and span they'd expect ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)), and leaves the Promise path as it is ([`effect-first-public-apis.md`](../decisions/effect-first-public-apis.md)). Running `report` in the request's fiber is worth doing anyway, so the spans and annotations reach every report.

## Blocked until answered

- Nothing is blocked; `onError` is documented as a callback.

## Details

- Effect callbacks for the procedure lifecycle helpers (`onStart`, `onSuccess`, `onError`, `onFinish`) are a separate question (`effect-lifecycle-callbacks.md` in this folder). This file is only about the handlers' `onError` option; the two answers should agree.
