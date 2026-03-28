---
name: superjson
description: >
  Configure SuperJSON transformer on both server initTRPC.create({ transformer:
  superjson }) and every client terminating link (httpBatchLink, httpLink, wsLink,
  httpSubscriptionLink) to support Date, Map, Set, BigInt over the wire. Transformer
  must match on both sides. In v11, transformer goes on individual links, not the
  client constructor.
type: composition
library: trpc
library_version: '11.15.1'
requires:
  - server-setup
  - client-setup
sources:
  - www/docs/server/data-transformers.md
---

# tRPC -- SuperJSON Transformer

## Setup

### 1. Install superjson

```bash
npm install superjson
```

### 2. Add to initTRPC on the server

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
```

### 3. Add to every terminating link on the client

```ts
// client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './server/trpc';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});
```

Now Date, Map, Set, BigInt, RegExp, undefined, and other non-JSON types survive the round trip.

## Core Patterns

### SuperJSON with splitLink and Subscriptions

```ts
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './server/trpc';

const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: 'http://localhost:3000/trpc',
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000/trpc',
        transformer: superjson,
      }),
    }),
  ],
});
```

Every terminating link in every branch must have `transformer: superjson`.

### SuperJSON with wsLink

```ts
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './server/trpc';

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
});

const client = createTRPCClient<AppRouter>({
  links: [
    wsLink<AppRouter>({
      client: wsClient,
      transformer: superjson,
    }),
  ],
});
```

### Returning Dates from Procedures

```ts
// server
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

const appRouter = router({
  getEvent: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return {
        id: input.id,
        name: 'Launch Party',
        date: new Date('2025-01-01T00:00:00Z'),
      };
    }),
});

export type AppRouter = typeof appRouter;
```

```ts
// client
const event = await client.getEvent.query({ id: '1' });
console.log(event.date instanceof Date); // true
console.log(event.date.getFullYear()); // 2025
```

Without superjson, `event.date` would be a string like `"2025-01-01T00:00:00.000Z"`.

## Common Mistakes

### [CRITICAL] Transformer on server but missing from client link

Wrong:

```ts
// Server
const t = initTRPC.create({ transformer: superjson });

// Client
const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});
```

Correct:

```ts
// Server
const t = initTRPC.create({ transformer: superjson });

// Client
const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});
```

Server encodes with superjson but client tries to parse raw JSON, causing "Unable to transform response" or garbled data.

Source: www/docs/server/data-transformers.md

### [CRITICAL] Transformer goes on individual links, not createTRPCClient

The `transformer` option is on individual terminating links:

```ts
createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});
```

In v11, `transformer` was moved from the client constructor to individual links. Passing it to `createTRPCClient` throws a TypeError.

Source: packages/client/src/internals/TRPCUntypedClient.ts

### [CRITICAL] Transformer on only some terminating links in splitLink

Wrong:

```ts
splitLink({
  condition: (op) => op.type === 'subscription',
  true: httpSubscriptionLink({
    url: 'http://localhost:3000/trpc',
    // missing transformer!
  }),
  false: httpBatchLink({
    url: 'http://localhost:3000/trpc',
    transformer: superjson,
  }),
});
```

Correct:

```ts
splitLink({
  condition: (op) => op.type === 'subscription',
  true: httpSubscriptionLink({
    url: 'http://localhost:3000/trpc',
    transformer: superjson,
  }),
  false: httpBatchLink({
    url: 'http://localhost:3000/trpc',
    transformer: superjson,
  }),
});
```

Every terminating link must have the same transformer. A missing transformer on one branch causes deserialization failures only for operations routed through that branch.

Source: www/docs/server/data-transformers.md

### [HIGH] Using transformer on client but not on server

Wrong:

```ts
// Server -- no transformer
const t = initTRPC.create();

// Client
httpBatchLink({ url, transformer: superjson });
```

Correct:

```ts
// Server
const t = initTRPC.create({ transformer: superjson });

// Client
httpBatchLink({ url, transformer: superjson });
```

The transformer must be configured on both `initTRPC.create()` and every client link. Client-only transformer corrupts the request encoding because the server expects plain JSON.

Source: www/docs/server/data-transformers.md

## See Also

- `client-setup` -- create the tRPC client and configure links
- `links` -- detailed options for each link type including transformer
- `server-setup` -- initTRPC.create() where the server transformer is configured
