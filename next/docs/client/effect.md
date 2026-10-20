---
title: The Effect client
description: '`createEffectClient` returns an Effect per call and a Stream per subscription, with typed errors in the error channel.'
section: Client
order: 6
---

`createEffectClient` from `@trpc12/trpc/effect` returns an `Effect` per call and a `Stream` per subscription. Typed errors are in the error channel, and interrupting the fiber aborts the request.

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { Effect } from 'effect';

const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});

const program = Effect.gen(function* () {
  const post = yield* client.post.byId.query({ id: '1' });
  return post.title;
});
```

The links are the same as the Promise client's ([Links](./links.md)). For spans around calls, see [Tracing](./tracing.md).

## Errors

A call fails with the errors a Promise client call rejects with: the procedure's errors, the built-in ones and the links' own. An error's `_tag` is its code, so `Effect.catchTag` handles a code and removes it from the error channel. A built-in error with that code (`defined: false`, such as a `NOT_FOUND` from a server that doesn't have the procedure) is caught too:

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
import { Effect } from 'effect';

const title = client.post.byId.query({ id: '1' }).pipe(
  Effect.map((post) => post.title),
  Effect.catchTag('NOT_FOUND', (err) =>
    Effect.succeed(err.defined ? `no post ${err.data.id}` : err.message),
  ),
);
```

`Effect.catchTags` handles several codes, and `Effect.result` gives a `Result` instead of failing, like the Promise client's `safe()`. Failures of the links themselves that aren't errors (a bug in a custom link) are defects, not failures.

## Interruption

Interrupting a call's fiber aborts its request, so `Effect.timeout`, `Effect.race` and a fiber that is interrupted stop the call on the server too. Each run of a call's Effect is its own request: `Effect.retry` sends it again.

## Subscriptions

A subscription is a `Stream` of what the server emits. Ending the stream early, as `Stream.take` does, closes the subscription on the server:

```ts twoslash
// ---cut-start---
import { httpLink, routerType, sse } from '@trpc12/trpc/client';
import { t } from './server.ts';
const router = {
  ticks: t.procedure.subscription(async function* () {
    for (let i = 0; ; i++) yield i;
  }),
};
// ---cut-end---
import { createEffectClient } from '@trpc12/trpc/effect';
import { Effect, Stream } from 'effect';

const client = createEffectClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc', subscriptions: sse() })],
});

const firstThree = client.ticks
  .subscribe()
  .pipe(Stream.take(3), Stream.runCollect);
```

Call options are the Promise client's: what links read, `lastEventId` and `signal`. Interrupting already aborts, so a `signal` is only for aborting from outside Effect.
