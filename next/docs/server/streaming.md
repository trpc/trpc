---
title: Streaming
description: Return async generators, Effect streams and nested promises; validate each item with stream().
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

Over HTTP, `httpLink` reads such outputs as JSONL (or binary frames, [Files](./files.md)); `wsLink` and `localLink` carry them as they are. Every [serializer](./serializers.md) streams deferred values.

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

## Streams and subscriptions

A streamed query or mutation is one call whose result arrives in pieces; the client consumes it once. A [subscription](../subscriptions/overview.md) is a stream of events the client follows, with `tracked()` ids to resume after a reconnect. For progress of long jobs in TanStack Query, see [Long jobs](../integrations/tanstack-query/streamed-mutations.md#long-jobs).

The [`examples/media-pipeline`](../../examples/media-pipeline/README.md) app streams upload progress from an Effect `Stream`, a report whose nested promises settle one by one, and an album export from an async generator, each validated with `stream()`.
