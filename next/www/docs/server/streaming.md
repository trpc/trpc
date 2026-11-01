---
title: Streaming
description: Return async generators, Effect streams and nested promises; validate each item with `stream()`.
section: Server
order: 6
v11: client/links/httpBatchStreamLink
---

A query or mutation can return an async generator or an Effect `Stream`, and the client gets an `AsyncIterable`. Outputs can also hold promises and async iterables at any depth: the rest of the output arrives first, and each deferred value streams as it settles.

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
// ---cut-end---
const countdown = t.procedure.query(async function* () {
  for (let i = 3; i > 0; i--) {
    yield i;
  }
  return 'liftoff';
});

const page = t.procedure.query(() => ({
  title: 'Post',
  comments: Promise.resolve(['First!']),
}));
```

Over HTTP, `httpLink` reads such outputs as JSONL (or binary frames, [Files](./files.md)); `wsLink` and `localLink` carry them as they are. Every [transformer](./transformers.md) streams deferred values.

## Validating items

To validate each item, wrap the item schema in `stream()`; a second schema validates the generator's return value, which the client gets as the iterator's final value:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
import { z } from 'zod';
const Token = z.object({ text: z.string() });
const Summary = z.object({ tokens: z.number() });
// ---cut-end---
import { stream } from '@trpc12/trpc/server';

const chat = t.procedure
  .output(stream(Token, Summary))
  .mutation(async function* () {
    yield { text: 'He' };
    yield { text: 'llo' };
    return { tokens: 2 };
  });
```

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { stream } from '@trpc12/trpc/server';
import { z } from 'zod';
import { t } from './server.ts';
const Token = z.object({ text: z.string() });
const Summary = z.object({ tokens: z.number() });
const chat = t.procedure
  .output(stream(Token, Summary))
  .mutation(async function* () {
    yield { text: 'He' };
    yield { text: 'llo' };
    return { tokens: 2 };
  });
const client = createTrpcClient({
  router: routerType<{ chat: typeof chat }>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
const it = await client.chat.mutate(); // AsyncIterable<Token, Summary>
```

A plain `.output(Item)` on a streaming resolver is a type error that points to `stream()`. An invalid item fails the stream with `INTERNAL_SERVER_ERROR` after the items before it have been delivered. Streams nested inside an object output aren't validated.

Over HTTP the server reads a stream only as fast as the client reads the response: a generator waits at its `yield` while the client is behind, and its `finally` runs when the client leaves. WebSocket links don't wait yet; there, a slow client buffers on the server.

## Errors

A returned `Stream`'s failures are the procedure's errors, inferred like returned ones: `Stream.fail(error({ code: 'SOLD_OUT' }))` types `SOLD_OUT` on the client, and once the procedure declares `.errors()`, failing with a code it doesn't list is a type error ([Errors](./errors.md#declaring-errors)). A generator has no failure type: what it throws is typed only when `.errors()` lists the code, as in a resolver, and a `TrpcError` it yields or returns is a value, an item or the final value, as in a subscription.

The call resolves before its stream fails, so the client's iterable carries the call's errors, as a subscription does. `safe()` iterates it without throwing, as a client from `createSafeClient` does on its own: each item is `[item, undefined]`, and a failure is a last `[undefined, error]`, which `matchError()` takes with the stream's codes and `STREAM_INTERRUPTED` as keys ([Errors without try/catch](../client/errors.md#streamed-outputs-and-subscriptions)):

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { error } from '@trpc12/trpc/server';
import { Stream } from 'effect';
import { t } from './server.ts';
declare function render(seat: string): void;
const router = t.router({
  seats: t.procedure.query(() =>
    Stream.fromIterable(['A1', 'A2']).pipe(
      Stream.concat(
        Stream.fail(error({ code: 'SOLD_OUT', data: { sold: 2 } })),
      ),
    ),
  ),
});
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
async function showSeats() {
  const [seats, err] = await safe(client.seats.query());
  if (err) return err.message;
  for await (const [seat, streamErr] of safe(seats)) {
    if (streamErr) {
      return matchError(streamErr, {
        SOLD_OUT: (e) => `Sold out after ${e.data.sold}`,
        STREAM_INTERRUPTED: () => 'The list was cut off',
        NETWORK_ERROR: () => 'You are offline',
        BAD_RESPONSE: () => 'Try again later',
        unexpected: (e) => e.message,
      });
    }
    render(seat);
  }
}
```

The call's own error lists the stream's failures too, as a subscription's does: [streamed queries](../integrations/tanstack-query.md) report both as the query's error.

## Streams and subscriptions

A streamed query or mutation is one call whose result arrives in pieces; the client consumes it once. A [subscription](../subscriptions/overview.md) is a stream of events the client follows, with `tracked()` ids to resume after a reconnect. For progress of long jobs in TanStack Query, see [Long jobs](../integrations/tanstack-query/streamed-mutations.md#long-jobs).

The [`examples/media-pipeline`](../../../examples/media-pipeline/README.md) app streams upload progress from an Effect `Stream`, a report whose nested promises settle one by one, and an album export from an async generator, each validated with `stream()`.
