---
id: httpSubscriptionLink
title: HTTP Subscription Link
sidebar_label: HTTP Subscription Link
slug: /client/links/httpSubscriptionLink
---

`httpSubscriptionLink` is a [**terminating link**](./overview.md#the-terminating-link) that's uses [Server-sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) (SSE) for subscriptions.

SSE is a good option for real-time as it's a bit easier than setting up a WebSockets-server.

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
   * @see https://trpc.io/docs/v11/client/links
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

:::tip
The document here outlines the specific details of using `httpSubscriptionLink`. For general usage of subscriptions, see [our subscriptions guide](../../server/subscriptions.md).
:::

## Headers and authorization / authentication

### Web apps

#### Same domain

If you're doing a web application, cookies are sent as part of the request as long as your client is on the same domain as the server.

#### Cross-domain

If the client and server are not on the same domain, you can use `withCredentials: true` ([read more on MDN here](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/withCredentials)).

**Example:**

```tsx
// [...]
unstable_httpSubscriptionLink({
  url: 'https://example.com/api/trpc',
  eventSourceOptions() {
    return {
      withCredentials: true, // <---
    };
  },
});
```

### Custom headers through ponyfill

**Recommended for non-web environments**

You can ponyfill `EventSource` and use the `eventSourceOptions` -callback to populate headers.

```tsx
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { EventSourcePolyfill } from 'event-source-polyfill';
import type { AppRouter } from '../server/index.js';

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: unstable_httpSubscriptionLink({
        url: 'http://localhost:3000',
        // ponyfill EventSource
        EventSource: EventSourcePolyfill,
        // options to pass to the EventSourcePolyfill constructor
        eventSourceOptions: async ({ op }) => {
          //                          ^ Includes the operation that's being executed
          // you can use this to generate a signature for the operation
          const signature = await getSignature(op);
          return {
            headers: {
              authorization: 'Bearer supersecret',
              'x-signature': signature,
            },
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

### Updating configuration on an active connection {#updatingConfig}

`httpSubscriptionLink` leverages SSE through `EventSource`, ensuring that connections encountering errors like network failures or bad response codes are automatically retried. However, `EventSource` does not allow re-execution of the `eventSourceOptions()` or `url()` options to update its configuration, which is particularly important in scenarios where authentication has expired since the last connection.

To address this limitation, you can use a [`retryLink`](./retryLink.md) in conjunction with `httpSubscriptionLink`. This approach ensures that the connection is re-established with the latest configuration, including any updated authentication details.

:::caution
Please note that restarting the connection will result in the `EventSource` being recreated from scratch, which means any previously tracked events will be lost.
:::

```tsx
import {
  createTRPCClient,
  httpBatchLink,
  retryLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import {
  EventSourcePolyfill,
  EventSourcePolyfillInit,
} from 'event-source-polyfill';
import type { AppRouter } from '../server/index.js';

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      false: httpBatchLink({
        url: 'http://localhost:3000',
      }),
      true: [
        retryLink({
          retry: (opts) => {
            opts.op.type;
            //       ^? will always be 'subscription' since we're in a splitLink
            const code = opts.error.data?.code;
            if (!code) {
              // This shouldn't happen as our httpSubscriptionLink will automatically retry within when there's a non-parsable response
              console.error('No error code found, retrying', opts);
              return true;
            }
            if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
              console.log('Retrying due to 401/403 error');
              return true;
            }
            return false;
          },
        }),
        unstable_httpSubscriptionLink({
          url: async () => {
            // calculate the latest URL if needed...
            return getAuthenticatedUri();
          },
          // ponyfill EventSource
          EventSource: EventSourcePolyfill,
          eventSourceOptions: async () => {
            // ...or maybe renew an access token
            const token = await auth.getOrRenewToken();

            return {
              headers: {
                authorization: `Bearer ${token}`,
              },
            };
          },
        }),
      ],
    }),
  ],
});
```

### Connection params {#connectionParams}

In order to authenticate with `EventSource`, you can define `connectionParams` in `httpSubscriptionLink`. This will be sent as part of the URL, which is why other methods are preferred).

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

## Timeout Configuration {#timeout}

The `httpSubscriptionLink` supports configuring a timeout for inactivity through the `reconnectAfterInactivityMs` option. If no messages (including ping messages) are received within the specified timeout period, the connection will be marked as "connecting" and automatically attempt to reconnect.

The timeout configuration is set on the server side when initializing tRPC:

```ts title="server/trpc.ts"
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create({
  sse: {
    client: {
      reconnectAfterInactivityMs: 3_000,
    },
  },
});
```

## Server Ping Configuration {#server-ping}

The server can be configured to send periodic ping messages to keep the connection alive and prevent timeout disconnections. This is particularly useful when combined with the `reconnectAfterInactivityMs`-option.

```ts title="server/trpc.ts"
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create({
  sse: {
    // Maximum duration of a single SSE connection in milliseconds
    // maxDurationMs: 60_00,
    ping: {
      // Enable periodic ping messages to keep connection alive
      enabled: true,
      // Send ping message every 2s
      intervalMs: 2_000,
    },
    // client: {
    //   reconnectAfterInactivityMs: 3_000
    // }
  },
});
```

## Compatibility (React Native) {#compatibility-react-native}

The `httpSubscriptionLink` makes use of the `EventSource` API, Streams API, and `AsyncIterator`s, these are not natively supported by React Native and will have to be ponyfilled.

To ponyfill `EventSource` we recommend to use a polyfill that utilizes the networking library exposed by React Native, over using a polyfill that using the `XMLHttpRequest` API. Libraries that polyfill `EventSource` using `XMLHttpRequest` fail to reconnect after the app has been in the background. Consider using the [rn-eventsource-reborn](https://www.npmjs.com/package/rn-eventsource-reborn) package.

The Streams API can be ponyfilled using the [web-streams-polyfill](https://www.npmjs.com/package/web-streams-polyfill) package.

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

globalThis.ReadableStream = globalThis.ReadableStream || ReadableStream;
globalThis.TransformStream = globalThis.TransformStream || TransformStream;
```

Once the ponyfills are added, you can continue setting up the `httpSubscriptionLink` as described in the [setup](#setup) section.

## `httpSubscriptionLink` Options

```ts
type HTTPSubscriptionLinkOptions<
  TRoot extends AnyClientTypes,
  TEventSource extends EventSourceLike.AnyConstructor = typeof EventSource,
> = {
  /**
   * EventSource ponyfill
   */
  EventSource?: TEventSource;
  /**
   * EventSource options or a callback that returns them
   */
  eventSourceOptions?:
    | EventSourceLike.InitDictOf<TEventSource>
    | ((opts: {
        op: Operation;
      }) =>
        | EventSourceLike.InitDictOf<TEventSource>
        | Promise<EventSourceLike.InitDictOf<TEventSource>>);
};
```

## SSE Options on the server

```ts
export interface SSEStreamProducerOptions<TValue = unknown> {
  ping?: {
    /**
     * Enable ping comments sent from the server
     * @default false
     */
    enabled: boolean;
    /**
     * Interval in milliseconds
     * @default 1000
     */
    intervalMs?: number;
  };
  /**
   * Maximum duration in milliseconds for the request before ending the stream
   * @default undefined
   */
  maxDurationMs?: number;
  /**
   * End the request immediately after data is sent
   * Only useful for serverless runtimes that do not support streaming responses
   * @default false
   */
  emitAndEndImmediately?: boolean;
  /**
   * Client-specific options - these will be sent to the client as part of the first message
   * @default {}
   */
  client?: {
    /**
     * Timeout and reconnect after inactivity in milliseconds
     * @default undefined
     */
    reconnectAfterInactivityMs?: number;
  };
}
```
