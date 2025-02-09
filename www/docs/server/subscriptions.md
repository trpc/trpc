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

| Type       | Example Type                            | Link                                                                                                                       |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| WebSockets | Bare-minimum Node.js WebSockets example | [/examples/standalone-server](https://github.com/trpc/trpc/tree/next/examples/standalone-server)                           |
| SSE        | Full-stack SSE implementation           | [github.com/trpc/examples-next-sse-chat](https://github.com/trpc/examples-next-sse-chat)                                   |
| WebSockets | Full-stack WebSockets implementation    | [github.com/trpc/examples-next-prisma-websockets-starter](https://github.com/trpc/examples-next-prisma-starter-websockets) |

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
If you're fetching data based on the `lastEventId`, and capturing all events is critical, make sure you setup the event listener before fetching events from your database as is done in [our full-stack SSE example](https://github.com/trpc/examples-next-sse-chat), this can prevent newly emitted events being ignored while yield'ing the original batch based on `lastEventId`.
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
      // We start by subscribing to the ee so that we don't miss any new events while fetching
      const iterable = ee.toIterable('add', {
        // Passing the AbortSignal from the request automatically cancels the event emitter when the request is aborted
        signal: opts.signal,
      });

      if (opts.input.lastEventId) {
        // [...] get the posts since the last event id and yield them
        // const items = await db.post.findMany({ ... })
        // for (const item of items) {
        //   yield tracked(item.id, item);
        // }
      }
      // listen for new events
      for await (const [data] of on(ee, 'add', {
        signal: opts.signal,
      })) {
        const post = data as Post;
        // tracking the post id ensures the client can reconnect at any time and get the latest events this id
        yield tracked(post.id, post);
      }
    }),
});
```

## Stopping a subscription from the server {#stopping-from-server}

If you need to stop a subscription from the server, simply `return` in the generator function.

```ts
import { publicProcedure, router } from '../trpc';

export const subRouter = router({
  onPostAdd: publicProcedure
    .input(
      z.object({
        lastEventId: z.string().coerce.number().min(0).optional(),
      }),
    )
    .subscription(async function* (opts) {
      let index = opts.input.lastEventId ?? 0;
      while (true) {
        const idx = index++;
        if (idx > 100) {
          // With this, the subscription will stop and the client will disconnect
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }),
});
```

On the client, you just `.unsubscribe()` the subscription.

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
      for await (const [data] of on(ee, 'add', {
        signal: opts.signal,
      })) {
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

Throwing an error in a generator function propagates to `trpc`'s `onError()` on the backend.

If the error thrown is a 5xx error, the client will automatically attempt to reconnect based on the last event id that is [tracked using `tracked()`](#tracked). For other errors, the subscription will be cancelled and propagate to the `onError()` callback.

## Output validation {#output-validation}

Since subscriptions are async iterators, you have to go through the iterator to validate the output.

### Example with zod

```ts title="zAsyncIterable.ts"
import type { TrackedEnvelope } from '@trpc/server';
import { isTrackedEnvelope, tracked } from '@trpc/server';
import { z } from 'zod';

function isAsyncIterable<TValue, TReturn = unknown>(
  value: unknown,
): value is AsyncIterable<TValue, TReturn> {
  return !!value && typeof value === 'object' && Symbol.asyncIterator in value;
}
const trackedEnvelopeSchema =
  z.custom<TrackedEnvelope<unknown>>(isTrackedEnvelope);

/**
 * A Zod schema helper designed specifically for validating async iterables. This schema ensures that:
 * 1. The value being validated is an async iterable.
 * 2. Each item yielded by the async iterable conforms to a specified type.
 * 3. The return value of the async iterable, if any, also conforms to a specified type.
 */
export function zAsyncIterable<
  TYieldIn,
  TYieldOut,
  TReturnIn = void,
  TReturnOut = void,
  Tracked extends boolean = false,
>(opts: {
  /**
   * Validate the value yielded by the async generator
   */
  yield: z.ZodType<TYieldIn, any, TYieldOut>;
  /**
   * Validate the return value of the async generator
   * @remark not applicable for subscriptions
   */
  return?: z.ZodType<TReturnIn, any, TReturnOut>;
  /**
   * Whether if the yielded values are tracked
   * @remark only applicable for subscriptions
   */
  tracked?: Tracked;
}) {
  return z
    .custom<
      AsyncIterable<
        Tracked extends true ? TrackedEnvelope<TYieldIn> : TYieldIn,
        TReturnIn
      >
    >((val) => isAsyncIterable(val))
    .transform(async function* (iter) {
      const iterator = iter[Symbol.asyncIterator]();

      try {
        let next;
        while ((next = await iterator.next()) && !next.done) {
          if (opts.tracked) {
            const [id, data] = trackedEnvelopeSchema.parse(next.value);
            yield tracked(id, await opts.yield.parseAsync(data));
            continue;
          }
          yield opts.yield.parseAsync(next.value);
        }
        if (opts.return) {
          return await opts.return.parseAsync(next.value);
        }
        return;
      } finally {
        await iterator.return?.();
      }
    }) as z.ZodType<
    AsyncIterable<
      Tracked extends true ? TrackedEnvelope<TYieldIn> : TYieldIn,
      TReturnIn,
      unknown
    >,
    any,
    AsyncIterable<
      Tracked extends true ? TrackedEnvelope<TYieldOut> : TYieldOut,
      TReturnOut,
      unknown
    >
  >;
}
```

Now you can use this helper to validate the output of your subscription procedures:

```ts title="_app.ts"
import { publicProcedure, router } from '../trpc';
import { zAsyncIterable } from './zAsyncIterable';

export const appRouter = router({
  mySubscription: publicProcedure
    .input(
      z.object({
        lastEventId: z.coerce.number().min(0).optional(),
      }),
    )
    .output(
      zAsyncIterable({
        yield: z.object({
          count: z.number(),
        }),
        tracked: true,
      }),
    )
    .subscription(async function* (opts) {
      let index = opts.input.lastEventId ?? 0;
      while (true) {
        index++;
        yield tracked(index, {
          count: index,
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }),
});
```
