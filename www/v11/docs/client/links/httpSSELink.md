---
id: httpSSELink
title: HTTP SSE Link
description: A terminating link for subscriptions over Server-sent Events, read with fetch
sidebar_label: HTTP SSE Link
slug: /client/links/httpSSELink
section: "Client Usage"
parent: "client/links"
order: 34
---

`httpSSELink` is a [**terminating link**](../links.md#the-terminating-link) for subscriptions over [Server-sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) (SSE). It reads the event stream with `fetch`, not `EventSource`, so it:

- sends `headers`, and runs a `headers` function again on every reconnect, so a refreshed token is picked up without a `retryLink`
- can send its input in a `POST` body with `methodOverride`
- reads an error response, such as a `405` or a `401` from a middleware, as a `TRPCClientError` with its code
- needs no polyfill where `fetch` can stream a response

It replaces [`httpSubscriptionLink`](./httpSubscriptionLink.md), and reads the same server responses: the server doesn't change.

## Setup {#setup}

The HTTP links don't carry subscriptions, so route them to `httpSSELink` with a [`splitLink`](./splitLink.md):

```ts twoslash title="client/index.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  httpBatchLink,
  httpSSELink,
  loggerLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSSELink({
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
This page covers the link. For writing subscriptions on the server, see [the subscriptions guide](../../server/subscriptions.md).
:::

## Headers and authentication {#headers}

`headers` is an object, or a function of the operation that returns one. A function runs before every connection, reconnects included:

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
declare const auth: { getOrRenewToken(): Promise<string> };
// ---cut---
import { httpSSELink } from '@trpc/client';

httpSSELink({
  url: 'https://example.com/api/trpc',
  async headers({ op }) {
    return {
      authorization: `Bearer ${await auth.getOrRenewToken()}`,
      'x-procedure': op.path,
    };
  },
});
```

A browser sends cookies with a same-origin request. For cookies on a cross-origin request, pass a `fetch` that sets `credentials` (the server must allow it with [CORS](../cors.md)):

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { httpSSELink } from '@trpc/client';

httpSSELink({
  url: 'https://example.com/api/trpc',
  fetch(url, options) {
    return fetch(url, { ...options, credentials: 'include' });
  },
});
```

### Connection params {#connectionParams}

`connectionParams` reach `createContext()` as `info.connectionParams`, the same as with [`wsLink`](../../server/websockets.md#connectionParams), so one `createContext` can authenticate both. They're sent in the URL, which servers and proxies log, so prefer `headers` for secrets. A function runs before every connection.

```ts twoslash title="server/context.ts"
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export const createContext = async (opts: CreateHTTPContextOptions) => {
  const token = opts.info.connectionParams?.token;
  //    ^?

  // [... authenticate]

  return {};
};
```

```ts twoslash title="client/trpc.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { httpSSELink } from '@trpc/client';

httpSSELink({
  url: 'http://localhost:3000',
  connectionParams: async () => ({
    token: 'supersecret',
  }),
});
```

## Sending the input in a POST body {#methodOverride}

A subscription is a `GET` with its input in the URL. For an input too long for a URL, send it in a `POST` body with `methodOverride: 'POST'`. The server must set [`allowMethodOverride: true`](../../rpc.md#overriding-the-default-http-method):

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { httpSSELink } from '@trpc/client';

httpSSELink({
  url: 'http://localhost:3000',
  methodOverride: 'POST',
});
```

## Reconnecting {#reconnect}

When a connection drops, the link opens a new one. If the subscription yields [`tracked()`](../../server/subscriptions.md#tracked) events, the new connection sends the last event's id as the input's `lastEventId`, so the subscription resumes where it left off.

- **The server ends the stream** without finishing the subscription, at [`maxDurationMs`](#server-options) or with `emitAndEndImmediately`: the link reconnects at once. This isn't a failure.
- **A connection fails**: a network error, an error response without a tRPC error in it (an HTML page from a proxy, say), or a retryable tRPC error: `INTERNAL_SERVER_ERROR`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE` or `GATEWAY_TIMEOUT`. The link waits `reconnect.delay(attempt)` and tries again, up to `reconnect.attempts` failures in a row. Then the subscription errors with the last failure. An event received resets the count.
- **Any other tRPC error**, such as `UNAUTHORIZED`, ends the subscription with that error at once.
- **No bytes for [`reconnectAfterInactivityMs`](#server-options)**: the link reconnects at once.

While it reconnects, `onConnectionStateChange` gets `connecting` with the error that caused it, then `pending` once the new connection is open. `onStarted` is called for every connection.

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { httpSSELink } from '@trpc/client';

httpSSELink({
  url: 'http://localhost:3000',
  reconnect: {
    // keep trying, every 5 seconds
    attempts: Infinity,
    delay: () => 5_000,
  },
});
```

To retry on errors the link doesn't, such as `UNAUTHORIZED` after a token expired, put a [`retryLink`](./retryLink.md) before it. It resubscribes from the last event id too.

## Server options {#server-options}

The server's SSE options are set in `initTRPC.create()`. They apply to `httpSSELink` and `httpSubscriptionLink` alike.

```ts twoslash title="server/trpc.ts"
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create({
  sse: {
    // end each connection after 60s; the client reconnects with the last event id
    maxDurationMs: 60_000,
    ping: {
      // send a ping every 2s, so proxies don't close a quiet connection
      enabled: true,
      intervalMs: 2_000,
    },
    client: {
      // the client reconnects after 5s without a byte, pings included
      reconnectAfterInactivityMs: 5_000,
    },
  },
});
```

| Option | Description |
| --- | --- |
| `enabled` | Whether subscriptions can be served over SSE. Default `true`. |
| `ping.enabled`, `ping.intervalMs` | Send a ping every `intervalMs` (default `1000`) while a subscription is open. Default off. |
| `maxDurationMs` | End each connection after this long. The client reconnects. Use it under a platform's response time limit. |
| `emitAndEndImmediately` | End the connection after each event, for runtimes that can't stream a response. The client reconnects for the next one. |
| `client.reconnectAfterInactivityMs` | Sent to the client in the first event. The client reconnects when nothing arrives for this long. `ping.intervalMs` must be shorter. |

## Compatibility {#compatibility}

`httpSSELink` needs a `fetch` whose response `body` is a `ReadableStream`, and `TextDecoder`. Browsers, Node.js 18+, Deno, Bun and Cloudflare Workers have both.

### React Native {#compatibility-react-native}

React Native's built-in `fetch` doesn't stream a response body. Pass a `fetch` that does: on Expo, `fetch` from [`expo/fetch`](https://docs.expo.dev/versions/latest/sdk/expo/); otherwise [`react-native-fetch-api`](https://github.com/react-native-community/fetch) with its `textStreaming` option, along with polyfills for `ReadableStream` ([`web-streams-polyfill`](https://www.npmjs.com/package/web-streams-polyfill)) and `TextDecoder`, as for [`httpBatchStreamLink`](./httpBatchStreamLink.md#react-native).

```ts
import { httpSSELink } from '@trpc/client';
import { fetch } from 'expo/fetch';

httpSSELink({
  url: 'http://localhost:3000',
  fetch,
});
```

## Migrating from `httpSubscriptionLink` {#migrating-from-httpsubscriptionlink}

Rename the import. The server, the router and `useSubscription` don't change. Then move the `EventSource`-only options:

| `httpSubscriptionLink` | `httpSSELink` |
| --- | --- |
| `EventSource: EventSourcePolyfill` | Drop it, and the polyfill. |
| `eventSourceOptions: { headers }` | `headers` |
| `eventSourceOptions: { withCredentials: true }` | `fetch` with `credentials: 'include'`, as in [Headers and authentication](#headers) |
| `url: async () => url` | `url` is a string. Move what changed per connection, such as a token, to `headers` or `connectionParams`. |
| `retryLink` to refresh headers on reconnect | Not needed: `headers` runs on every reconnect. |
| `connectionParams`, `transformer` | Unchanged. |

The link retries a failed connection `reconnect.attempts` times (default 5) before the subscription errors, where `EventSource` retried forever. Set `reconnect: { attempts: Infinity }` for that.

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
declare function getToken(): Promise<string>;
// ---cut---
import { httpSSELink } from '@trpc/client';

// before:
// httpSubscriptionLink({
//   url: 'http://localhost:3000',
//   EventSource: EventSourcePolyfill,
//   eventSourceOptions: async () => ({
//     headers: { authorization: `Bearer ${await getToken()}` },
//   }),
// });

httpSSELink({
  url: 'http://localhost:3000',
  headers: async () => ({
    authorization: `Bearer ${await getToken()}`,
  }),
});
```

## Options {#options}

```ts twoslash
type AnyClientTypes = any;
type DataTransformerOptions = any;
type FetchEsque = any;
type HTTPHeaders = any;
type Operation = any;
// ---cut---
type HTTPSSELinkOptions<TRoot extends AnyClientTypes> = {
  /** The URL of your tRPC endpoint, such as `http://localhost:3000/trpc`. */
  url: string | URL;
  /**
   * Headers for each connection: an object, or a function of the
   * operation that returns them. A function runs on every reconnect.
   */
  headers?:
    | HTTPHeaders
    | ((opts: { op: Operation }) => HTTPHeaders | Promise<HTTPHeaders>);
  /**
   * Params for `createContext()`'s `info.connectionParams`, sent in the
   * URL's `connectionParams` query parameter.
   */
  connectionParams?:
    | Record<string, string>
    | null
    | (() =>
        | Record<string, string>
        | null
        | Promise<Record<string, string> | null>);
  reconnect?: {
    /**
     * Failed connections in a row to retry before the subscription errors.
     * @default 5
     */
    attempts?: number;
    /**
     * Milliseconds to wait before the `attempt`th retry, from 1.
     * @default (attempt) => Math.min(1000 * 2 ** (attempt - 1), 30_000)
     */
    delay?: (attempt: number) => number;
  };
  /** The `fetch` to use, if not the global one. */
  fetch?: FetchEsque;
  /**
   * Send the input in a POST body. The server must set
   * `allowMethodOverride: true`.
   */
  methodOverride?: 'POST';
  /** Must match the server's `pathSeparator`. @default '.' */
  pathSeparator?: '.' | '_' | '~' | '-';
  /** @see https://trpc.io/docs/server/data-transformers */
  transformer?: DataTransformerOptions;
};
```

## Reference

The source code for this link is on [GitHub](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpSSELink.ts).
