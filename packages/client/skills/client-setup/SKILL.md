---
name: client-setup
description: >
  Create a vanilla tRPC client with createTRPCClient<AppRouter>(), configure
  link chain with httpBatchLink/httpLink, dynamic headers for auth, transformer
  on links (not client constructor). Infer types with inferRouterInputs and
  inferRouterOutputs. AbortController signal support. TRPCClientError typing.
type: core
library: trpc
library_version: '11.14.0'
requires:
  - server-setup
sources:
  - www/docs/client/overview.md
  - www/docs/client/vanilla/overview.md
  - www/docs/client/vanilla/setup.mdx
  - www/docs/client/vanilla/infer-types.md
  - www/docs/client/headers.md
  - packages/client/src/internals/TRPCUntypedClient.ts
---

# tRPC -- Client Setup

## Setup

```ts
// server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  user: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => ({ id: input.id, name: 'Bilbo' })),
    create: t.procedure
      .input(z.object({ name: z.string() }))
      .mutation(({ input }) => ({ id: '1', ...input })),
  }),
});

export type AppRouter = typeof appRouter;
```

```ts
// client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

const user = await client.user.byId.query({ id: '1' });
const created = await client.user.create.mutate({ name: 'Frodo' });
```

## Core Patterns

### Dynamic Auth Headers

```ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

let token = '';

export function setToken(newToken: string) {
  token = newToken;
}

export const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      headers() {
        return {
          Authorization: token ? `Bearer ${token}` : '',
        };
      },
    }),
  ],
});
```

The `headers` callback is invoked on every HTTP request, so token changes take effect immediately.

### Inferring Procedure Input and Output Types

```ts
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

type UserCreateInput = RouterInput['user']['create'];
type UserByIdOutput = RouterOutput['user']['byId'];
```

### Aborting Requests with AbortController

```ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

const ac = new AbortController();
const query = client.user.byId.query({ id: '1' }, { signal: ac.signal });
ac.abort();
```

### Typed Error Handling

```ts
import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from './server';

function isTRPCClientError(
  cause: unknown,
): cause is TRPCClientError<AppRouter> {
  return cause instanceof TRPCClientError;
}

try {
  await client.user.byId.query({ id: '1' });
} catch (cause) {
  if (isTRPCClientError(cause)) {
    console.log('tRPC error code:', cause.data?.code);
  }
}
```

## Common Mistakes

### [CRITICAL] Missing AppRouter type parameter on createTRPCClient

Wrong:

```ts
const client = createTRPCClient({ links: [httpBatchLink({ url })] });
```

Correct:

```ts
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url })] });
```

Without the type parameter, all procedure calls return `any` and type safety is completely lost.

Source: www/docs/client/vanilla/setup.mdx

### [CRITICAL] Transformer goes on individual links, not createTRPCClient

In v11, the `transformer` option is on individual terminating links, not the client constructor:

```ts
import superjson from 'superjson';

createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      transformer: superjson,
    }),
  ],
});
```

In v11, the `transformer` option was moved from the client constructor to individual terminating links. Passing it to `createTRPCClient` throws a TypeError.

Source: packages/client/src/internals/TRPCUntypedClient.ts

### [CRITICAL] Transformer on server but not on client links

Wrong:

```ts
// Server: initTRPC.create({ transformer: superjson })
// Client:
httpBatchLink({ url: 'http://localhost:3000' });
```

Correct:

```ts
// Server: initTRPC.create({ transformer: superjson })
// Client:
httpBatchLink({ url: 'http://localhost:3000', transformer: superjson });
```

If the server uses a transformer, every terminating link on the client must also specify that transformer. Mismatch causes "Unable to transform response" errors.

Source: https://github.com/trpc/trpc/issues/7083

### [CRITICAL] Using import instead of import type for AppRouter

Wrong:

```ts
import { AppRouter } from '../server/router';
```

Correct:

```ts
import type { AppRouter } from '../server/router';
```

A non-type import pulls the entire server bundle into the client. Use `import type` so it is erased at build time.

Source: www/docs/client/vanilla/setup.mdx

### [CRITICAL] Importing appRouter value to derive type in client

Wrong:

```ts
import { appRouter } from '../server/router';

type AppRouter = typeof appRouter;
```

Correct:

```ts
// In server: export type AppRouter = typeof appRouter;
// In client:
import type { AppRouter } from '../server/router';
```

Importing the `appRouter` value (not just the type) bundles the entire server into the client, shipping server code to the browser.

Source: www/docs/server/routers.md

### [CRITICAL] Using type assertions to bypass AppRouter import errors

Wrong:

```ts
const client = createTRPCClient<any>({ links: [httpBatchLink({ url })] });
```

Correct:

```ts
// Fix the import path or monorepo configuration
import type { AppRouter } from '@myorg/api-types';

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url })] });
```

Casting to `any` or manually recreating the router type destroys end-to-end type safety. Fix the import path or monorepo config instead.

Source: www/docs/client/vanilla/setup.mdx

### [CRITICAL] Using createTRPCProxyClient (renamed in v11)

Wrong:

```ts
import { createTRPCProxyClient } from '@trpc/client';
```

Correct:

```ts
import { createTRPCClient } from '@trpc/client';
```

`createTRPCProxyClient` was renamed to `createTRPCClient` in v11.

Source: www/docs/client/vanilla/setup.mdx

### [CRITICAL] Treating tRPC as a REST API

Wrong:

```ts
fetch('/api/trpc/users/123', { method: 'GET' });
```

Correct:

```ts
const user = await client.user.byId.query({ id: '123' });
// Raw equivalent: GET /api/trpc/user.byId?input={"id":"123"}
```

tRPC uses JSON-RPC over HTTP. Procedures are called by dot-separated name with JSON input, not by REST resource paths.

Source: www/docs/client/overview.md

### [HIGH] HTML error page instead of JSON response

If you see `couldn't parse JSON, invalid character '<'`, the tRPC endpoint returned an HTML page (404/503) instead of JSON. This means the `url` in your link config is wrong or infrastructure routing is misconfigured -- it is not a tRPC bug. Verify the URL matches your adapter's mount point.

Source: www/docs/client/vanilla/setup.mdx

## See Also

- `links` -- configure httpBatchLink, httpLink, splitLink, and other link types
- `superjson` -- set up SuperJSON transformer on server and client
- `server-setup` -- define routers, procedures, context, and export AppRouter type
- `react-query-setup` -- use tRPC with TanStack React Query for React applications
