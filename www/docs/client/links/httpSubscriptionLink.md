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

### Custom headers through polyfill {#authorization-by-polyfilling-eventsource}

**Recommended for non-web environments**

You can polyfill `EventSource` and use the `eventSourceOptions` -callback to populate headers.

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

### Updating configuration on an active connection {#updatingConfig}

Since `httpSubscriptionLink` is built on SSE via `EventSource`, connections which encounter errors such as network failures or bad response codes will be seamlessly retried. EventSource cannot re-run the `eventSourceOptions()` or `url()` options to update its configuration though, for instance where authentication has expired since the last connection.

We support fully restarting the connection when an error occurs.

:::caution
Note that this will cause the `EventSource` to be re-created from scratch and any [`tracked()`](../../server/subscriptions.md#tracked)-events to be lost.
:::

```tsx
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import {
  EventSourcePolyfill,
  EventSourcePolyfillInit,
} from 'event-source-polyfill';
import type { AppRouter } from '../server/index.js';

// polyfill EventSource
globalThis.EventSource = EventSourcePolyfill;

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: unstable_httpSubscriptionLink({
        url: async () => {
          // calculate the latest URL if needed...
          return getAuthenticatedUri();
        },
        eventSourceOptions: async () => {
          // ...or maybe renew an access token
          const token = await auth.getOrRenewToken();

          return {
            headers: {
              authorization: 'Bearer ' + token,
            },
          } as EventSourcePolyfillInit;
        },

        // In this example we handle an authentication failure
        experimental_shouldRecreateOnError(opts) {
          let willRestart = false;
          if (opts.type === 'event') {
            const ev = opts.event;
            willRestart =
              'status' in ev &&
              typeof ev.status === 'number' &&
              [401, 403].includes(ev.status);
          }
          if (willRestart) {
            console.log('Restarting EventSource due to 401/403 error');
          }
          return willRestart;
        },
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000',
      }),
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
   * @see https://trpc.io/docs/v11/data-transformers
   **/
  transformer?: DataTransformerOptions;
  /**
   * For a given error, should we reinitialize the underlying EventSource?
   *
   * This is useful where a long running subscription might be interrupted by a recoverable network error,
   * but the existing authorization in a header or URI has expired in the mean-time
   */
  experimental_shouldRecreateOnError?: (
    opts:
      | {
          type: 'event';
          event: Event;
        }
      | {
          type: 'serialized-error';
          error: unknown;
        },
  ) => boolean | Promise<boolean>;
};
```
