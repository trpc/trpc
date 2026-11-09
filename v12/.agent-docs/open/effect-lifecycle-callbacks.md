---
title: Should `onStart`, `onSuccess`, `onError` and `onFinish` accept callbacks that return an Effect?
summary: The lifecycle helpers take Promise callbacks only; logging through Effect services means writing an Effect middleware instead.
area: effect
recommended: A
links:
  - kind: docs
    label: Lifecycle hooks
    url: https://v12.trpc.io/v12/docs/middleware/lifecycle
  - kind: docs
    label: Effect middleware (around next())
    url: https://v12.trpc.io/v12/docs/server/effect#around-next
  - kind: decision
    label: middleware
    url: ../decisions/middleware.md
  - kind: decision
    label: effect-first-public-apis
    url: ../decisions/effect-first-public-apis.md
  - kind: code
    label: lifecycle helpers (middleware.ts)
    url: ../../packages/trpc/src/server/procedures/middleware.ts
---

# Should `onStart`, `onSuccess`, `onError` and `onFinish` accept callbacks that return an Effect?

## Why it matters

The four helpers in `@trpc12/trpc/middleware` take callbacks that return `void` or a `Promise`; a callback returning an Effect is a type error. Inside a chain they already run as Effect middleware (`~effectMiddleware`, no extra fiber), but the callback itself can't `yield*` a service such as a logger or a metrics client from the handler's `layer`. Today that's an Effect middleware with `Effect.tapError` or `Effect.onExit`, which is a few more lines.

## Options

### A) Keep them Promise-only; point to Effect middleware

The helpers stay as they are. The lifecycle docs link the Effect middleware form for callbacks that need services.

```ts twoslash
// @errors: 2322
// ---cut-start---
import { onError } from '@trpc12/trpc/middleware';
import { Context, Effect } from 'effect';
import { t } from './server.ts';
declare const log: { warn: (path: string, code: string) => void };
class Metrics extends Context.Service<
  Metrics,
  { failed: (path: string, code: string) => Effect.Effect<void> }
>()('Metrics') {}
// ---cut-end---
// Promise callbacks: the helpers
t.procedure.use(onError((err, opts) => log.warn(opts.path, err.code)));

// Effect callbacks: an Effect middleware
const logged = t.middleware.effect()((opts) =>
  opts.next().pipe(
    Effect.tapError((err) =>
      Effect.gen(function* () {
        const metrics = yield* Metrics;
        yield* metrics.failed(opts.path, err.code);
      }),
    ),
  ),
);
t.procedure.use(logged);

// Doesn't compile: a helper's callback can't return an Effect
t.procedure.use(onError((err) => Effect.logError(err.code)));
```

- ✅ No change; the helpers stay part of the Effect-free surface the human asked for (`effect-first-public-apis.md`)
- ✅ Effect middleware already gets every combinator (`tapError`, `onExit`, `retry`) and adds its services to the procedure's
- ❌ Two ways to observe a call, picked by whether the callback needs a service

### B) Also accept a callback that returns an Effect, as `experimental_`

The helpers take either kind of callback; an Effect callback's services join the procedure's requirements, like an Effect middleware's.

```ts twoslash
// @errors: 2345
// ---cut-start---
import { createFetchHandler } from '@trpc12/trpc/server';
import { Context, Effect } from 'effect';
import { onErrorB as onError } from '../open/effect-lifecycle-callbacks.ts';
import { t } from './server.ts';
class Metrics extends Context.Service<
  Metrics,
  { failed: (path: string, code: string) => Effect.Effect<void> }
>()('Metrics') {}
// ---cut-end---
const ping = t.procedure
  .use(
    onError((err, opts) =>
      Effect.gen(function* () {
        const metrics = yield* Metrics;
        yield* metrics.failed(opts.path, err.code);
      }),
    ),
  )
  .query(() => 'pong');

// Doesn't compile: the procedure now requires Metrics from the handler's layer
createFetchHandler({
  router: t.router({ ping }),
  createContext: () => ({ user: null }),
});
```

- ✅ One helper whichever kind of code observes the call
- ❌ A requirements type parameter on all four helpers, on the Effect-free surface; measure with `pnpm bench shapes`
- ❌ A callback returning an Effect is a type error today, which catches a forgotten `Effect.runPromise`; B makes it valid

## Recommendation

**A.** Effect middleware already is the Effect form of these hooks, with every combinator, and keeping the helpers Promise-only keeps procedure declaration free of Effect types. B can come later as an addition without breaking anyone.

## Blocked until answered

- Nothing. The lifecycle page would link Effect middleware under A, and document Effect callbacks under B.

## Details

- Not one of proposal 27's questions: Q27.3 ([`middleware-as-service.md`](./middleware-as-service.md)) is middleware as a service with `.use(Key)`, and doesn't touch the helpers' callbacks.
- A handler's own `onError` option returning an Effect is a separate question ([`handler-on-error-effect.md`](./handler-on-error-effect.md)); this one is the procedure-level helpers.
- The helpers' Effect form (`lifecycle`, `after`, `runCallback`) runs a callback in the call's fiber and only waits when it returns a promise, so a synchronous callback stays synchronous ([`middleware.md`](../decisions/middleware.md)). B would add a third branch there: run a returned Effect in the same fiber.
- From the first-release review, question 14, recommended there as A.
