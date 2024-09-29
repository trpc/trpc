---
id: subscriptions
title: Subscriptions
sidebar_label: Subscriptions
slug: /server/subscriptions
---

## Introduction

Subscriptions are a type of real-time event stream between the client and server. Use subscriptions when you need to push real-time updates to the client.

With tRPC's subscriptions, the client establishes and maintains a persistent connection to the server plus automatically attempts to reconnect and recover gracefully if disconnected with the help of [`tracked()`](#tracked) events.

## WebSockets or Server-sent Events?

You can either use WebSockets or [Server-sent Events](https://en.wikipedia.org/wiki/Server-sent_events) (SSE) to setup real-time subscriptions in tRPC.

- For WebSockets, see [the WebSockets page](./websockets.md)
- For SSE, see the [httpSubscriptionLink](../client/links/httpSubscriptionLink.md)

If you are unsure which one to use, we recommend using SSE for subscriptions as it's easier to setup and don't require setting up a WebSocket server.

## Reference projects

| Type       | Example Type                         | Link                                                                                                                       |
| ---------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| SSE        | Bare-minimum Node.js SSE example     | [/examples/standalone-server](https://github.com/trpc/trpc/tree/next/examples/standalone-server)                           |
| SSE        | Full-stack SSE implementation        | [github.com/trpc/examples-next-sse-chat](https://github.com/trpc/examples-next-sse-chat)                                   |
| WebSockets | Full-stack WebSockets implementation | [github.com/trpc/examples-next-prisma-websockets-starter](https://github.com/trpc/examples-next-prisma-starter-websockets) |

## Basic example

:::tip
For a full example, see [our full-stack SSE example](https://github.com/trpc/examples-next-sse-chat).
:::

```ts title="server.ts"
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const ee = new EventEmitter();

export const appRouter = router({
  onPostAdd: publicProcedure.subscription(async function* (opts) {
    // listen for new events
    for await (const [data] of on(ee, 'add', {
      // Passing the AbortSignal from the request automatically cancels the event emitter when the request is aborted
      signal: opts.signal,
    })) {
      const post = data as Post;
      yield post;
    }
  }),
});
```

## Automatic tracking of id using `tracked()` (recommended) {#tracked}

If you `yield` an event using our `tracked()`-helper and include an `id`, the client will automatically reconnect when it gets disconnected and send the last known ID.

You can send an initial `lastEventId` when initializing the subscription and it will be automatically updated as the browser receives data.

- For SSE, this is part of the [`EventSource`-spec](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header) and will be propagated through `lastEventId` in your `.input()`.
- For WebSockets, our `wsLink` will automatically send the last known ID and update it as the browser receives data.

:::tip
If you're fetching data based on the `lastEventId`, and capturing all events is critical, you may want to use `ReadableStream`'s or a similar pattern as an intermediary as is done in [our full-stack SSE example](https://github.com/trpc/examples-next-sse-chat) to prevent newly emitted events being ignored while yield'ing the original batch based on `lastEventId`.
:::

```ts
import EventEmitter, { on } from 'events';
import type { Post } from '@prisma/client';
import { tracked } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const ee = new EventEmitter();

export const subRouter = router({
  onPostAdd: publicProcedure
    .input(
      z
        .object({
          // lastEventId is the last event id that the client has received
          // On the first call, it will be whatever was passed in the initial setup
          // If the client reconnects, it will be the last event id that the client received
          lastEventId: z.string().nullish(),
        })
        .optional(),
    )
    .subscription(async function* (opts) {
      if (opts.input.lastEventId) {
        // [...] get the posts since the last event id and yield them
      }
      // listen for new events
      for await (const [data] of on(ee, 'add'), {
        signal: opts.signal,
      }) {
        const post = data as Post;
        // tracking the post id ensures the client can reconnect at any time and get the latest events this id
        yield tracked(post.id, post);
      }
    }),
});
```

## Cleanup of side effects

If you need to clean up any side-effects of your subscription you can use the [`try...finally`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator/return#using_return_with_try...finally) pattern, as `trpc` invokes the `.return()` of the Generator Instance when the subscription stops for any reason.

```ts
import EventEmitter, { on } from 'events';
import type { Post } from '@prisma/client';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const ee = new EventEmitter();

export const subRouter = router({
  onPostAdd: publicProcedure.subscription(async function* (opts) {
    let timeout;
    try {
      for await (const [data] of on(ee, 'add'), {
        signal: opts.signal,
      }) {
        timeout = setTimeout(() => console.log('Pretend like this is useful'));
        const post = data as Post;
        yield post;
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }),
});
```

## Error handling

Throwing an error in a generator function propagates to `trpc`'s `onError()` on the backend, but the error will not be sent to the client - the client will automatically reconnect based on the last event id that is [tracked using `tracked()`](#tracked).

If this is surprising behavior to you and you have a finite amount of data to send, you should consider using [httpBatchStreamLink](../client/links/httpBatchStreamLink.md) instead.

## Output validation {#output-validation}

Since subscriptions are async iterators, you have to go through the iterator to validate the output.

### Example with zod

```ts title="zAsyncIterable.ts"
import { isTrackedEnvelope, tracked, type TrackedEnvelope } from '@trpc/server';
import { z } from 'zod';

function isAsyncIterable<TValue, TReturn = unknown>(
  value: unknown,
): value is AsyncIterable<TValue, TReturn> {
  return !!value && typeof value === 'object' && Symbol.asyncIterator in value;
}

/**
 * Zod schema for an async iterable
 * - validates that the value is an async iterable
 * - parses each item in the async iterable
 */
export function zAsyncIterable<TYieldIn, TYieldOut>(
  yieldSchema: z.ZodType<TYieldIn, any, TYieldOut>,
) {
  return z
    .custom<AsyncIterable<TYieldIn, void, unknown>>((val) =>
      isAsyncIterable(val),
    )
    .transform(async function* (iter) {
      for await (const data of iter) {
        yield yieldSchema.parseAsync(data);
      }
    });
}

/**
 * Zod schema for an async iterable
 * - Validates that the schema is tracked
 * - Validates that the value is an async iterable
 * - Validates each item in the async iterable
 */
export function zAsyncIterableTracked<TYieldIn, TYieldOut>(
  yieldSchema: z.ZodType<TYieldIn, any, TYieldOut>,
) {
  const trackedEnvelopeSchema =
    z.custom<TrackedEnvelope<TYieldIn>>(isTrackedEnvelope);

  return z
    .custom<AsyncIterable<TrackedEnvelope<TYieldIn>, any, any>>(isAsyncIterable)
    .transform(async function* (iter) {
      for await (const data of iter) {
        const [id, value] = trackedEnvelopeSchema.parse(data);
        yield tracked(id, yieldSchema.parse(value));
      }
    });
}
```

Now you can use this helper to validate the output of your subscription procedures:

```ts title="_app.ts"
import { publicProcedure, router } from '../trpc';
import { zAsyncIterable } from './zAsyncIterable';

export const appRouter = router({
  mySubscription: publicProcedure
    .output(zAsyncIterable(z.number()))
    .subscription(async function* (opts) {
      while (true) {
        yield Math.random();

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }),
});
```
