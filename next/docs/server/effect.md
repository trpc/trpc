---
title: Effect
description: Resolvers that return Effects, services from the handler's layer, typed failures and tracing.
section: Server
order: 9
---

tRPC v12 is built on [Effect](https://effect.website), and using it is optional: resolvers can return plain values and promises. A resolver can also return an `Effect` or a `Stream`. Its failures become errors, and the services it needs become the handler's required `layer`:

```ts twoslash
// ---cut-start---
import { t, type Post } from './server.ts';
declare const PostRepoLive: import('effect').Layer.Layer<PostRepo>;
// ---cut-end---
import { createFetchHandler } from '@trpc12/trpc/server';
import { Context, Effect } from 'effect';
import { z } from 'zod';

class PostRepo extends Context.Service<
  PostRepo,
  { find: (id: string) => Effect.Effect<Post | undefined> }
>()('PostRepo') {}

const byId = t.procedure.input(z.object({ id: z.string() })).query((opts) =>
  Effect.gen(function* () {
    const repo = yield* PostRepo;
    return yield* repo.find(opts.input.id);
  }),
);

createFetchHandler({
  router: { byId },
  createContext: () => ({ user: null }),
  layer: PostRepoLive,
});
```

Write resolvers the way Effect code is written elsewhere: `Effect.fn` takes the resolver's options, and an Effect Schema validates the input, decoding with the services the procedure has:

```ts twoslash
// ---cut-start---
import { t, type Post } from './server.ts';
// ---cut-end---
import { Context, Effect, Schema } from 'effect';

class PostRepo extends Context.Service<
  PostRepo,
  { find: (id: string) => Effect.Effect<Post | undefined> }
>()('PostRepo') {}

const byId = t.procedure.input(Schema.Struct({ id: Schema.String })).query(
  Effect.fn('post.byId')(function* (opts) {
    const repo = yield* PostRepo;
    return yield* repo.find(opts.input.id);
  }),
);
```

## Errors clients may see

A failure that isn't a `TrpcError` is a type error until it is mapped (`Effect.catchTag`), so internals like a database error's query never reach clients. Mark the errors clients may see by making them `TrpcError.Tagged` classes; yielding one sends it typed, with its `data` validated first. A thrown one (`Effect.die`, or a `throw` in a helper) has no type, so it's typed only once the procedure lists it, `.errors({ POST_NOT_FOUND: PostNotFound })`:

```ts twoslash
// ---cut-start---
import { TrpcError } from '@trpc12/trpc/server';
import { Effect, Schema } from 'effect';
import { z } from 'zod';
import { t, type Post } from './server.ts';
declare const repo: { find: (id: string) => Effect.Effect<Post | undefined> };
// ---cut-end---
class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String }),
}) {}

t.procedure.input(z.object({ id: z.string() })).query((opts) =>
  Effect.gen(function* () {
    const post = yield* repo.find(opts.input.id);
    if (!post) return yield* new PostNotFound({ id: opts.input.id });
    return post;
  }),
);
```

## Services for some procedures

`.provide(Service, make)` provides a service to everything after it: later inputs, `.provide()` calls, middleware and the resolver. `make` gets `ctx`, the input parsed so far, `meta` and `path`, and returns the service, a promise of it, or an Effect. The Effect may only fail with a `TrpcError`, which joins the procedure's error union, and what it needs joins the services the handler's `layer` provides:

```ts twoslash
// ---cut-start---
import { Context, Effect } from 'effect';
import { error } from '@trpc12/trpc/server';
import { t, type User } from './server.ts';
// ---cut-end---
class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

const authed = t.procedure.provide(CurrentUser, (opts) =>
  opts.ctx.user
    ? Effect.succeed(opts.ctx.user)
    : Effect.fail(error({ code: 'UNAUTHORIZED' })),
);

const me = authed.query(() =>
  Effect.gen(function* () {
    return (yield* CurrentUser).name;
  }),
);
```

A service a procedure provides isn't one the handler's `layer` has to.

## Middleware that provides services

`t.middleware.effect<{ provides: S }>()(fn)` writes a middleware whose `next()` is an `Effect`, so it can provide services:

```ts twoslash
// ---cut-start---
import { Context, Effect } from 'effect';
import { t, type User } from './server.ts';
class CurrentUser extends Context.Service<CurrentUser, User | null>()(
  'CurrentUser',
) {}
// ---cut-end---
const withUser = t.middleware.effect<{ provides: CurrentUser }>()((opts) =>
  opts.next().pipe(Effect.provideService(CurrentUser, opts.ctx.user)),
);
```

## Resources

Effect code in a query or mutation has a `Scope`, as in `effect/rpc`: what an Effect resolver, a `.provide()` factory or an Effect middleware acquires with `Effect.acquireRelease` is released when that step ends, so a transaction a `.provide()` opens lives until the resolver is done. A subscription's code gets none; acquire in its `Stream` (`Stream.acquireRelease`, or `Stream.unwrap` of an Effect that acquires), which releases when the subscription ends.

```ts twoslash
// ---cut-start---
import { Context, Effect } from 'effect';
import { t } from './server.ts';
declare const db: {
  begin: Effect.Effect<{ insert: (title: string) => Effect.Effect<string> }>;
  commit: Effect.Effect<void>;
};
// ---cut-end---
class Tx extends Context.Service<
  Tx,
  { insert: (title: string) => Effect.Effect<string> }
>()('Tx') {}

const inTx = t.procedure.provide(Tx, () =>
  Effect.acquireRelease(db.begin, () => db.commit),
);

const create = inTx.mutation(() =>
  Effect.gen(function* () {
    return yield* (yield* Tx).insert('Hello');
  }),
);
```

## The services a router needs

`inferRouterServices<typeof router>` is what every entry point's `layer` must provide; leaving one out is a type error that names it.

| entry point                                  | the `layer` is built                                     |
| -------------------------------------------- | -------------------------------------------------------- |
| `createFetchHandler({ router, layer })`      | once, on the first call; `handler.dispose()` releases it |
| `createRouterClient(router, { ctx, layer })` | once per client, on its first call, and kept             |
| `localLink({ router, layer })`               | once per link, on its first call, and kept               |
| `call(procedure, input, { ctx, layer })`     | for the call, and released after it                      |

Build long-lived resources (connection pools) into the handler's `layer`, not per `call()`.

## Tracing

Tracing is opt-in: put a tracer in the handler's `layer` (`@effect/opentelemetry`) and every call runs in an Effect span named `trpc.<path>`, with `rpc.system`, `rpc.method` and `trpc.type` attributes, plus `trpc.error.code` when it fails. Spans opened in middlewares and resolvers nest under it. Without a tracer, calls open no span, so requests don't pay for one.

The span continues the request's trace: the `http.server` span on Effect HTTP servers, or the incoming `traceparent` header on `handler.fetch`, so a traced client and the server share one trace ([Client tracing](../client/tracing.md)). A WebSocket call continues the trace in its message's `trace` field, and starts its own trace without one.

[`examples/effect-observability`](../../examples/effect-observability/README.md) puts these together: an Effect middleware that tags the call's span, service spans under it, and a mail sent with `Effect.forkDetach` whose span joins the trace after the response.

## Work after the response

`Effect.forkDetach` starts a fiber that keeps running after the call returns, on a long-lived server:

```ts twoslash
// ---cut-start---
import { Effect } from 'effect';
import { t, type User } from './server.ts';
declare const Users: { create: (input: unknown) => Effect.Effect<User> };
declare const Mailer: { welcome: (user: User) => Effect.Effect<void> };
// ---cut-end---
t.procedure.mutation((opts) =>
  Effect.gen(function* () {
    const user = yield* Users.create(opts.input);
    yield* Effect.forkDetach(Mailer.welcome(user));
    return user;
  }),
);
```

Serverless runtimes may freeze the instance once the response is sent. There, hand the promise to the platform: `ctx.waitUntil()` on Workers (see [Fetch runtimes](../adapters/fetch.md#platform-arguments)), `after()` in Next.js, `waitUntil` from `@vercel/functions` on Vercel.

## The Effect client

On the client side, `createEffectClient` returns an `Effect` per call and a `Stream` per subscription ([The Effect client](../client/effect.md)).
