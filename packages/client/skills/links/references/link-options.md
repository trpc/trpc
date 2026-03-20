# Link Options Reference

## httpLink

Terminating link that sends one tRPC operation per HTTP request.

```ts
import { httpLink } from '@trpc/client';

httpLink({
  url: 'http://localhost:3000/trpc',
  fetch: customFetch,
  transformer: superjson,
  headers: { Authorization: 'Bearer token' },
  methodOverride: 'POST',
});
```

| Option           | Type                                                                              | Default        | Description                                   |
| ---------------- | --------------------------------------------------------------------------------- | -------------- | --------------------------------------------- |
| `url`            | `string \| URL`                                                                   | required       | Server endpoint URL                           |
| `fetch`          | `typeof fetch`                                                                    | global `fetch` | Fetch ponyfill                                |
| `transformer`    | `DataTransformerOptions`                                                          | none           | Data transformer (e.g. superjson)             |
| `headers`        | `HTTPHeaders \| (opts: { op: Operation }) => HTTPHeaders \| Promise<HTTPHeaders>` | `{}`           | Static headers object or per-request callback |
| `methodOverride` | `'POST'`                                                                          | none           | Force all requests as POST                    |

## httpBatchLink

Terminating link that batches multiple operations into a single HTTP request.

```ts
import { httpBatchLink } from '@trpc/client';

httpBatchLink({
  url: 'http://localhost:3000/trpc',
  maxURLLength: 2083,
  maxItems: 10,
  headers({ opList }) {
    return { Authorization: `Bearer ${opList[0]?.context.token}` };
  },
  transformer: superjson,
});
```

| Option           | Type                                                                                    | Default        | Description                                          |
| ---------------- | --------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| `url`            | `string \| URL`                                                                         | required       | Server endpoint URL                                  |
| `fetch`          | `typeof fetch`                                                                          | global `fetch` | Fetch ponyfill                                       |
| `transformer`    | `DataTransformerOptions`                                                                | none           | Data transformer                                     |
| `headers`        | `HTTPHeaders \| (opts: { opList: Operation[] }) => HTTPHeaders \| Promise<HTTPHeaders>` | `{}`           | Headers callback receives `opList` (array), not `op` |
| `maxURLLength`   | `number`                                                                                | `Infinity`     | Split batch if URL exceeds this length               |
| `maxItems`       | `number`                                                                                | `Infinity`     | Maximum operations per batch                         |
| `methodOverride` | `'POST'`                                                                                | none           | Force all requests as POST                           |

## httpBatchStreamLink

Terminating link similar to httpBatchLink but streams responses as they arrive instead of waiting for all to complete.

```ts
import { httpBatchStreamLink } from '@trpc/client';

httpBatchStreamLink({
  url: 'http://localhost:3000/trpc',
  maxURLLength: 2083,
  maxItems: 10,
  transformer: superjson,
  streamHeader: 'accept',
});
```

| Option                      | Type                        | Default         | Description                                                                                       |
| --------------------------- | --------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| All `httpBatchLink` options |                             |                 | Inherits all httpBatchLink options                                                                |
| `streamHeader`              | `'trpc-accept' \| 'accept'` | `'trpc-accept'` | Header used to signal streaming. Use `'accept'` to avoid CORS preflight on cross-origin requests. |

Sends `trpc-accept: application/jsonl` (or `Accept: application/jsonl`). Response arrives as `transfer-encoding: chunked` with `content-type: application/jsonl`. Cannot set response headers (including cookies) after stream begins.

## splitLink

Non-terminating link that branches the link chain based on a condition.

```ts
import {
  httpBatchLink,
  httpLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';

splitLink({
  condition: (op) => op.type === 'subscription',
  true: httpSubscriptionLink({ url }),
  false: httpBatchLink({ url }),
});
```

| Option      | Type                         | Default  | Description                                                   |
| ----------- | ---------------------------- | -------- | ------------------------------------------------------------- |
| `condition` | `(op: Operation) => boolean` | required | Route predicate                                               |
| `true`      | `TRPCLink \| TRPCLink[]`     | required | Link(s) for condition=true. Must include a terminating link.  |
| `false`     | `TRPCLink \| TRPCLink[]`     | required | Link(s) for condition=false. Must include a terminating link. |

Each branch creates its own sub-chain, so both branches need a terminating link.

## loggerLink

Non-terminating link that logs operations to the console.

```ts
import { loggerLink } from '@trpc/client';

loggerLink({
  enabled: (opts) =>
    (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') ||
    (opts.direction === 'down' && opts.result instanceof Error),
  colorMode: 'ansi',
});
```

| Option        | Type                                                                 | Default                              | Description                      |
| ------------- | -------------------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| `enabled`     | `(opts: { direction: 'up' \| 'down'; result?: unknown }) => boolean` | `() => true`                         | Control when logging is active   |
| `logger`      | `(opts: LoggerOpts) => void`                                         | built-in pretty logger               | Custom log function              |
| `console`     | `{ log: Function; error: Function }`                                 | `globalThis.console`                 | Console implementation           |
| `colorMode`   | `'ansi' \| 'css' \| 'none'`                                          | `'css'` in browser, `'ansi'` in Node | Color output mode                |
| `withContext` | `boolean`                                                            | `false` (true if css)                | Include operation context in log |

## retryLink

Non-terminating link that retries failed operations.

```ts
import { retryLink } from '@trpc/client';

retryLink({
  retry(opts) {
    if (opts.error.data?.code === 'INTERNAL_SERVER_ERROR') {
      return opts.attempts <= 3;
    }
    return false;
  },
  retryDelayMs: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
});
```

| Option         | Type                                         | Default   | Description                 |
| -------------- | -------------------------------------------- | --------- | --------------------------- |
| `retry`        | `(opts: { op, error, attempts }) => boolean` | required  | Return true to retry        |
| `retryDelayMs` | `(attempt: number) => number`                | `() => 0` | Delay between retries in ms |

When used with subscriptions that use `tracked()`, automatically includes the last known event ID on retry.

## wsLink

Terminating link for WebSocket connections. Requires a `TRPCWebSocketClient`.

```ts
import { createWSClient, wsLink } from '@trpc/client';

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
  connectionParams: () => ({ token: 'supersecret' }),
  lazy: { enabled: true, closeMs: 10_000 },
  keepAlive: { enabled: true, intervalMs: 5_000, pongTimeoutMs: 1_000 },
});

wsLink<AppRouter>({
  client: wsClient,
  transformer: superjson,
});
```

### wsLink Options

| Option        | Type                     | Default  | Description                          |
| ------------- | ------------------------ | -------- | ------------------------------------ |
| `client`      | `TRPCWebSocketClient`    | required | WebSocket client from createWSClient |
| `transformer` | `DataTransformerOptions` | none     | Data transformer                     |

### createWSClient Options

| Option                    | Type                                                                                     | Default             | Description                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `url`                     | `string \| (() => MaybePromise<string>)`                                                 | required            | WebSocket server URL                                              |
| `connectionParams`        | `Record<string, string> \| null \| (() => MaybePromise<Record<string, string> \| null>)` | `null`              | Auth params sent as first message, available in `createContext()` |
| `WebSocket`               | `typeof WebSocket`                                                                       | global `WebSocket`  | WebSocket ponyfill                                                |
| `retryDelayMs`            | `(attemptIndex: number) => number`                                                       | exponential backoff | Reconnection delay                                                |
| `onOpen`                  | `() => void`                                                                             | none                | Connection opened callback                                        |
| `onError`                 | `(evt?: Event) => void`                                                                  | none                | Connection error callback                                         |
| `onClose`                 | `(cause?: { code?: number }) => void`                                                    | none                | Connection closed callback                                        |
| `lazy.enabled`            | `boolean`                                                                                | `false`             | Close WS after inactivity                                         |
| `lazy.closeMs`            | `number`                                                                                 | `0`                 | Idle timeout before closing                                       |
| `keepAlive.enabled`       | `boolean`                                                                                | `false`             | Send ping messages                                                |
| `keepAlive.intervalMs`    | `number`                                                                                 | `5000`              | Ping interval                                                     |
| `keepAlive.pongTimeoutMs` | `number`                                                                                 | `1000`              | Close if no pong within this time                                 |

## httpSubscriptionLink

Terminating link for Server-Sent Events (SSE) subscriptions.

```ts
import { httpSubscriptionLink } from '@trpc/client';
import { EventSourcePolyfill } from 'event-source-polyfill';

httpSubscriptionLink({
  url: 'http://localhost:3000/trpc',
  connectionParams: async () => ({ token: 'supersecret' }),
  transformer: superjson,
  EventSource: EventSourcePolyfill,
  eventSourceOptions: async ({ op }) => ({
    headers: {
      authorization: 'Bearer token',
    },
  }),
});
```

| Option               | Type                                                                                 | Default              | Description                               |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------- | ----------------------------------------- |
| `url`                | `string \| (() => string \| Promise<string>)`                                        | required             | Server endpoint URL                       |
| `connectionParams`   | `Record<string, string> \| null \| (() => MaybePromise<...>)`                        | none                 | Serialized as URL query param             |
| `transformer`        | `DataTransformerOptions`                                                             | none                 | Data transformer                          |
| `EventSource`        | EventSource constructor                                                              | global `EventSource` | EventSource ponyfill for custom headers   |
| `eventSourceOptions` | `EventSourceInit \| ((opts: { op }) => EventSourceInit \| Promise<EventSourceInit>)` | none                 | Options passed to EventSource constructor |

For cross-domain cookies, use `eventSourceOptions: () => ({ withCredentials: true })`.

## unstable_localLink

Terminating link for direct procedure calls without HTTP. Useful for testing and server-side usage.

```ts
import { unstable_localLink } from '@trpc/client';
import { appRouter } from './server';

unstable_localLink({
  router: appRouter,
  createContext: async () => ({ db: prisma }),
  onError: (opts) => console.error('Error:', opts.error),
});
```

| Option          | Type                                  | Default  | Description              |
| --------------- | ------------------------------------- | -------- | ------------------------ |
| `router`        | `AnyRouter`                           | required | tRPC router instance     |
| `createContext` | `() => Promise<Context>`              | required | Context factory per call |
| `onError`       | `(opts: ErrorHandlerOptions) => void` | none     | Error handler            |
| `transformer`   | `DataTransformerOptions`              | none     | Data transformer         |
