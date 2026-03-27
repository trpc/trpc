---
name: links
description: >
  Configure the tRPC client link chain: httpLink, httpBatchLink,
  httpBatchStreamLink, splitLink, loggerLink, wsLink, createWSClient,
  httpSubscriptionLink, unstable_localLink, retryLink. Choose the right
  terminating link. Route subscriptions via splitLink. Build custom links
  for SOA routing. Link options: url, headers, transformer, maxURLLength,
  maxItems, connectionParams, EventSource ponyfill.
type: core
library: trpc
library_version: '11.15.1'
requires:
  - client-setup
sources:
  - www/docs/client/links/overview.md
  - www/docs/client/links/httpLink.md
  - www/docs/client/links/httpBatchLink.md
  - www/docs/client/links/httpBatchStreamLink.md
  - www/docs/client/links/splitLink.mdx
  - www/docs/client/links/wsLink.md
  - www/docs/client/links/httpSubscriptionLink.md
  - www/docs/client/links/localLink.mdx
  - www/docs/client/links/loggerLink.md
  - packages/client/src/links/
---

# tRPC -- Links

## Setup

```ts
import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});
```

The `links` array is a chain: non-terminating links (loggerLink, splitLink, retryLink) forward operations; the chain must end with a terminating link (httpBatchLink, httpLink, httpBatchStreamLink, wsLink, httpSubscriptionLink, unstable_localLink).

## Core Patterns

### httpBatchLink -- Batch Multiple Calls into One Request

```ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      maxURLLength: 2083,
      maxItems: 10,
    }),
  ],
});

const [post1, post2, post3] = await Promise.all([
  client.post.byId.query(1),
  client.post.byId.query(2),
  client.post.byId.query(3),
]);
```

Concurrent calls are batched into a single HTTP request. Set `maxURLLength` to prevent 414 errors from long URLs.

### splitLink -- Route Subscriptions to SSE

```ts
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: 'http://localhost:3000/trpc',
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000/trpc',
      }),
    }),
  ],
});
```

### splitLink -- Disable Batching Per-Request via Context

```ts
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => Boolean(op.context.skipBatch),
      true: httpLink({ url: 'http://localhost:3000/trpc' }),
      false: httpBatchLink({ url: 'http://localhost:3000/trpc' }),
    }),
  ],
});

const result = await client.post.byId.query(1, {
  context: { skipBatch: true },
});
```

### httpBatchStreamLink -- Stream Responses as They Arrive

```ts
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

const iterable = await client.examples.iterable.query();
for await (const value of iterable) {
  console.log(value);
}
```

### wsLink -- WebSocket Terminating Link

```ts
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from './server';

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
});

const client = createTRPCClient<AppRouter>({
  links: [wsLink<AppRouter>({ client: wsClient })],
});
```

### Custom Link

```ts
import { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from './server';

export const timingLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const start = Date.now();
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(err) {
          console.error(`${op.path} failed in ${Date.now() - start}ms`);
          observer.error(err);
        },
        complete() {
          console.log(`${op.path} completed in ${Date.now() - start}ms`);
          observer.complete();
        },
      });
      return unsubscribe;
    });
  };
};
```

## Common Mistakes

### [CRITICAL] No terminating link in the chain

Wrong:

```ts
const client = createTRPCClient<AppRouter>({
  links: [loggerLink()],
});
```

Correct:

```ts
const client = createTRPCClient<AppRouter>({
  links: [loggerLink(), httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});
```

The link chain must end with a terminating link. Without one, tRPC throws "No more links to execute - did you forget to add an ending link?"

Source: packages/client/src/links/internals/createChain.ts

### [CRITICAL] Sending subscriptions through httpLink or httpBatchLink

Wrong:

```ts
const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});
await client.onMessage.subscribe({});
```

Correct:

```ts
const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: 'http://localhost:3000/trpc' }),
      false: httpBatchLink({ url: 'http://localhost:3000/trpc' }),
    }),
  ],
});
```

httpLink and httpBatchLink throw on subscription operations. Subscriptions must use httpSubscriptionLink or wsLink, routed via splitLink.

Source: packages/client/src/links/httpLink.ts

### [HIGH] httpBatchLink and httpBatchStreamLink headers callback receives { opList }

`httpBatchLink` and `httpBatchStreamLink` headers callbacks receive `{ opList }` (a `NonEmptyArray<Operation>`), not `{ op }` like `httpLink`. Access per-operation context via `opList[0]?.context`:

```ts
httpBatchLink({
  url: 'http://localhost:3000/trpc',
  headers({ opList }) {
    return { authorization: opList[0]?.context.token };
  },
});
```

`httpBatchLink` headers callback receives `{ opList }` (an array of operations)

Source: packages/client/src/links/httpBatchLink.ts

### [MEDIUM] Default batch limits are Infinity

Wrong:

```ts
httpBatchLink({ url: 'http://localhost:3000/trpc' });
```

Correct:

```ts
httpBatchLink({
  url: 'http://localhost:3000/trpc',
  maxURLLength: 2083,
  // should be the same or lower than the server's maxBatchSize
  maxItems: 10,
});
```

Both `maxURLLength` and `maxItems` default to `Infinity`, which can cause 413/414 HTTP errors on servers or CDNs with URL length limits. When the server sets `maxBatchSize`, set `maxItems` to the same or lower value so the client auto-splits batches instead of triggering a `400 Bad Request`.

Source: packages/client/src/links/httpBatchLink.ts

### [HIGH] httpBatchStreamLink data loss on stream completion

There is a known race condition where buffered chunks can be lost on normal stream completion. Long streaming responses (e.g., LLM output) may be truncated. If you experience truncated data, switch to `httpBatchLink` for those operations.

Source: https://github.com/trpc/trpc/issues/7209

## References

- [Link options reference](references/link-options.md)

## See Also

- `client-setup` -- create the tRPC client and configure links
- `superjson` -- add transformer to links for Date/Map/Set support
- `subscriptions` -- set up SSE or WebSocket real-time streams
- `non-json-content-types` -- route FormData/binary through splitLink + httpLink
- `service-oriented-architecture` -- build custom routing links for multi-service backends
