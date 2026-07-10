---
name: auth
description: >
  Implement JWT/cookie authentication and authorization in tRPC using createContext
  for user extraction, t.middleware with opts.next({ ctx }) for context narrowing to
  non-null user, protectedProcedure base pattern, client-side Authorization headers
  via httpBatchLink headers(), WebSocket connectionParams, and SSE auth via cookies
  or EventSource polyfill custom headers.
type: composition
library: trpc
library_version: '11.16.0'
requires:
  - server-setup
  - middlewares
  - client-setup
sources:
  - www/docs/server/authorization.md
  - www/docs/client/headers.md
  - www/docs/client/links/httpSubscriptionLink.md
  - www/docs/server/websockets.md
---

# tRPC — Auth

## Setup

```ts
// server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export async function createContext({ req }: CreateHTTPContextOptions) {
  async function getUserFromHeader() {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const user = await verifyJwt(token); // your JWT verification
      return user; // e.g. { id: string; name: string; role: string }
    }
    return null;
  }
  return { user: await getUserFromHeader() };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(
  async function isAuthed(opts) {
    const { ctx } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return opts.next({
      ctx: {
        user: ctx.user, // narrows user to non-null
      },
    });
  },
);

export const router = t.router;
```

```ts
// client/trpc.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/router';

let token = '';
export function setToken(t: string) {
  token = t;
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      headers() {
        return { Authorization: `Bearer ${token}` };
      },
    }),
  ],
});
```

## Core Patterns

### Context narrowing with auth middleware

```ts
import { initTRPC, TRPCError } from '@trpc/server';

type Context = { user: { id: string; role: string } | null };
const t = initTRPC.context<Context>().create();

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { user: ctx.user } });
});

const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);
export const adminProcedure = t.procedure.use(isAdmin);
```

### SSE subscription auth with EventSource polyfill

```ts
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import { EventSourcePolyfill } from 'event-source-polyfill';
import type { AppRouter } from '../server/router';

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: 'http://localhost:3000/trpc',
        EventSource: EventSourcePolyfill,
        eventSourceOptions: async () => {
          return {
            headers: {
              authorization: `Bearer ${getToken()}`,
            },
          };
        },
      }),
      false: httpBatchLink({
        url: 'http://localhost:3000/trpc',
        headers() {
          return { Authorization: `Bearer ${getToken()}` };
        },
      }),
    }),
  ],
});
```

### WebSocket auth with connectionParams

```ts
// server/context.ts
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

export const createContext = async (opts: CreateWSSContextFnOptions) => {
  const token = opts.info.connectionParams?.token;
  const user = token ? await verifyJwt(token) : null;
  return { user };
};
```

```ts
// client/trpc.ts
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '../server/router';

const wsClient = createWSClient({
  url: 'ws://localhost:3001',
  connectionParams: async () => ({
    token: getToken(),
  }),
});

const trpc = createTRPCClient<AppRouter>({
  links: [wsLink({ client: wsClient })],
});
```

### SSE auth with cookies (same domain)

```ts
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from '../server/router';

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: '/api/trpc',
        eventSourceOptions() {
          return { withCredentials: true };
        },
      }),
      false: httpBatchLink({ url: '/api/trpc' }),
    }),
  ],
});
```

## Common Mistakes

### HIGH Not narrowing user type in auth middleware

Wrong:

```ts
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next(); // user still nullable downstream
});
```

Correct:

```ts
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } }); // narrows to non-null
});
```

Without `opts.next({ ctx })`, downstream procedures still see `user` as `{ id: string } | null`, requiring redundant null checks.

Source: www/docs/server/authorization.md

### HIGH SSE auth via URL query params exposes tokens

Wrong:

```ts
httpSubscriptionLink({
  url: 'http://localhost:3000/trpc',
  connectionParams: async () => ({
    token: 'my-secret-jwt',
  }),
});
```

Correct:

```ts
import { EventSourcePolyfill } from 'event-source-polyfill';

httpSubscriptionLink({
  url: 'http://localhost:3000/trpc',
  EventSource: EventSourcePolyfill,
  eventSourceOptions: async () => ({
    headers: { authorization: 'Bearer my-secret-jwt' },
  }),
});
```

`connectionParams` are serialized as URL query strings for SSE, exposing tokens in server logs and browser history. Use cookies for same-domain or custom headers via an EventSource polyfill instead.

Source: www/docs/client/links/httpSubscriptionLink.md

### MEDIUM Async headers causing stuck isFetching

Wrong:

```ts
httpBatchLink({
  url: '/api/trpc',
  async headers() {
    const token = await refreshToken(); // can race
    return { Authorization: `Bearer ${token}` };
  },
});
```

Correct:

```ts
let cachedToken: string | null = null;

async function ensureToken() {
  if (!cachedToken) cachedToken = await refreshToken();
  return cachedToken;
}

httpBatchLink({
  url: '/api/trpc',
  async headers() {
    return { Authorization: `Bearer ${await ensureToken()}` };
  },
});
```

When the headers function is async (e.g., refreshing auth tokens), React Query's `isFetching` can get stuck permanently in certain race conditions.

Source: https://github.com/trpc/trpc/issues/7001

### HIGH Skipping auth or opening CORS too wide in prototypes

Wrong:

```ts
import cors from 'cors';

createHTTPServer({
  middleware: cors(), // origin: '*' by default
  router: appRouter,
  createContext() {
    return {};
  }, // no auth
}).listen(3000);
```

Correct:

```ts
import cors from 'cors';

createHTTPServer({
  middleware: cors({ origin: 'https://myapp.com' }),
  router: appRouter,
  createContext,
}).listen(3000);
```

Wildcard CORS and missing auth middleware are acceptable only during local development. Always restrict CORS origins and add auth before deploying.

Source: maintainer interview

## See Also

- **middlewares** -- context narrowing, `.use()`, `.concat()`, base procedure patterns
- **subscriptions** -- SSE and WebSocket transport setup for authenticated subscriptions
- **client-setup** -- `createTRPCClient`, link chain, `headers` option
- **links** -- `splitLink`, `httpSubscriptionLink`, `wsLink` configuration
