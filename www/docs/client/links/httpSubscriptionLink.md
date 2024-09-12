---
id: httpSubscriptionLink
title: HTTP Subscription Link
sidebar_label: HTTP Subscription Link
slug: /client/links/httpSubscriptionLink
---

`httpSubscriptionLink` is a [**terminating link**](./overview.md#the-terminating-link) that's uses [Server-sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) (SSE) for subscriptions.

SSE is a good option for real-time as it's a bit easier to deal with than WebSockets and handles things like reconnecting and continuing where it left off automatically.

:::info
We have prefixed this as `unstable_` as it's a new API, but you're safe to use it! [Read more](/docs/faq#unstable).
:::

## Setup {#setup}

:::info
If your client's environment doesn't support EventSource, you need an [EventSource polyfill](https://www.npmjs.com/package/event-source-polyfill). For React Native specific instructions please defer to the [compatibility section](#compatibility-react-native).
:::

To use `httpSubscriptionLink`, you need to use a [splitLink](./splitLink.mdx) to make it explicit that we want to use SSE for subscriptions.

```ts title="client/index.ts"
import type { TRPCLink } from '@trpc/client';
import {
  httpBatchLink,
  loggerLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';

const trpcClient = createTRPCClient<AppRouter>({
  /**
   * @link https://trpc.io/docs/v11/client/links
   */
  links: [
    // adds pretty logs to your console in development and logs errors in production
    loggerLink(),
    splitLink({
      // uses the httpSubscriptionLink for subscriptions
      condition: (op) => op.type === 'subscription',
      true: unstable_httpSubscriptionLink({
        url: `/api/trpc`,
      }),
      false: httpBatchLink({
        url: `/api/trpc`,
      }),
    }),
  ],
});
```

## Usage

:::tip
For a full example, see [our full-stack SSE example](https://github.com/trpc/examples-next-sse-chat).
:::

### Basic example

```ts
import EventEmitter, { on } from 'events';
import type { Post } from '@prisma/client';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

const ee = new EventEmitter();

export const subRouter = router({
  onPostAdd: publicProcedure.subscription(async function* (opts) {
    // listen for new events
    for await (const [data] of on(ee, 'add')) {
      const post = data as Post;
      yield post;
    }
  }),
});
```

### Automatic tracking of id using `tracked()` (recommended)

If you `yield` an event using our `tracked()`-helper and include an `id`, the browser will automatically reconnect when it gets disconnected and send the last known ID - this is part of the [`EventSource`-spec](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header) and will be propagated through `lastEventId` in your `.input()`.

You can send an initial `lastEventId` when initializing the subscription and it will be automatically updated as the browser receives data.

:::info
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
      for await (const [data] of on(ee, 'add')) {
        const post = data as Post;
        // tracking the post id ensures the client can reconnect at any time and get the latest events this id
        yield tracked(post.id, post);
      }
    }),
});
```

### Error handling

Throwing an error in the function propagates to `trpc`'s `onError()` on the backend, but the event is not serialized and sent to the frontend as is.

## Authentication / connection params {#connectionParams}

:::tip
If you're doing a web application, you can ignore this section as the cookies are sent as part of the request.
:::

In order to authenticate with `EventSource`, you can define `connectionParams` to `createWSClient`. **This will be sent as part of the URL.**

```ts twoslash title="server/context.ts"
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export const createContext = async (opts: CreateHTTPContextOptions) => {
  const token = opts.info.connectionParams?.token;
  //    ^?

  // [... authenticate]

  return {};
};

export type Context = Awaited<ReturnType<typeof createContext>>;
```

```ts title="client/trpc.ts"
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import type { AppRouter } from '../server/index.js';

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: unstable_httpSubscriptionLink({
        url: 'http://localhost:3000',
        connectionParams: async () => {
          // Will be serialized as part of the URL
          return {
            token: 'supersecret',
          };
        },
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000',
      }),
    }),
  ],
});
```

## Authorization by polyfilling `EventSource` and passing `eventSourceOptions` {#authorization-by-polyfilling-eventsource}

You can also polyfill `EventSource` and use the `options` -callback instead of `connectionParams`.

```tsx
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { EventSourcePolyfill } from 'event-source-polyfill';
import type { AppRouter } from '../server/index.js';

// polyfill EventSource
globalThis.EventSource = EventSourcePolyfill;

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: unstable_httpSubscriptionLink({
        url: 'http://localhost:3000',
        // options to pass to the EventSourcePolyfill constructor
        eventSourceOptions: async () => {
          return {
            headers: {
              authorization: 'Bearer supersecret',
            },
          }; // you either need to typecast to `EventSourceInit` or use `as any` or override the types by a `declare global` statement
        },
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000',
      }),
    }),
  ],
});
```

## Compatibility (React Native) {#compatibility-react-native}

The `httpSubscriptionLink` makes use of the `EventSource` API, Streams API, and `AsyncIterator`s, these are not natively supported by React Native and will have to be polyfilled.

To polyfill `EventSource` we recommend to use a polyfill that utilizes the networking library exposed by React Native, over using a polyfill that using the `XMLHttpRequest` API. Libraries that polyfill `EventSource` using `XMLHttpRequest` fail to reconnect after the app has been in the background. Consider using the [rn-eventsource-reborn](https://www.npmjs.com/package/rn-eventsource-reborn) package.

The Streams API can be polyfilled using the [web-streams-polyfill](https://www.npmjs.com/package/web-streams-polyfill) package.

`AsyncIterator`s can be polyfilled using the [@azure/core-asynciterator-polyfill](https://www.npmjs.com/package/@azure/core-asynciterator-polyfill) package.

### Installation

Install the required polyfills:

import { InstallSnippet } from '@site/src/components/InstallSnippet';

<InstallSnippet pkgs="rn-eventsource-reborn web-streams-polyfill @azure/core-asynciterator-polyfill" />

Add the polyfills to your project before the link is used (e.g. where you add your TRPCReact.Provider):

```ts title="utils/api.tsx"
import '@azure/core-asynciterator-polyfill';
import { RNEventSource } from 'rn-eventsource-reborn';
import { ReadableStream, TransformStream } from 'web-streams-polyfill';

// RNEventSource extends EventSource's functionality, you can add this to make the typing reflect this but it's not a requirement
declare global {
  interface EventSource extends RNEventSource {}
}
globalThis.EventSource = globalThis.EventSource || RNEventSource;

globalThis.ReadableStream = globalThis.ReadableStream || ReadableStream;
globalThis.TransformStream = globalThis.TransformStream || TransformStream;
```

Once the polyfills are added, you can continue setting up the `httpSubscriptionLink` as described in the [setup](#setup) section.

## `httpSubscriptionLink` Options

```ts
type MaybePromise<TValue> = TValue | Promise<TValue>;
type CallbackOrValue<TValue> = TValue | (() => MaybePromise<TValue>);

type HTTPSubscriptionLinkOptions<TRoot extends AnyClientTypes> = {
  /**
   * The URL to connect to (can be a function that returns a URL)
   */
  url: CallbackOrValue<string>;
  /**
   * EventSource options
   */
  eventSourceOptions?: CallbackOrValue<EventSourceInit>;
  /**
   * Data transformer
   * @link https://trpc.io/docs/v11/data-transformers
   **/
  transformer?: DataTransformerOptions;
};
```
