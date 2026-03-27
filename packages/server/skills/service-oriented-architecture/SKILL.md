---
name: service-oriented-architecture
description: >
  Break a tRPC backend into multiple services with custom routing links that
  split on the first path segment (op.path.split('.')) to route to different
  backend service URLs. Define a faux gateway router that merges service routers
  for the AppRouter type without running them in the same process. Share
  procedure and router definitions via a server-lib package with a single
  initTRPC instance. Each service runs its own standalone/Express/Fastify server.
type: composition
library: trpc
library_version: '11.15.1'
requires:
  - server-setup
  - client-setup
  - links
sources:
  - examples/soa/
---

# tRPC — Service-Oriented Architecture

## Setup

### Shared library (single initTRPC instance)

```ts
// packages/server-lib/index.ts
import { initTRPC } from '@trpc/server';

type Context = {
  requestId?: string;
};

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;
```

### Service A (own server)

```ts
// services/service-a/router.ts
import { publicProcedure, router } from '@myorg/server-lib';
import { z } from 'zod';

export const serviceARouter = router({
  greet: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ greeting: `Hello, ${input.name}!` })),
});
```

```ts
// services/service-a/index.ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serviceARouter } from './router';

createHTTPServer({
  router: serviceARouter,
  createContext() {
    return {};
  },
}).listen(2021);
```

### Service B (own server)

```ts
// services/service-b/router.ts
import { publicProcedure, router } from '@myorg/server-lib';

export const serviceBRouter = router({
  status: publicProcedure.query(() => ({ status: 'ok' })),
});
```

```ts
// services/service-b/index.ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serviceBRouter } from './router';

createHTTPServer({
  router: serviceBRouter,
  createContext() {
    return {};
  },
}).listen(2022);
```

### Gateway (type-only, not a running server)

```ts
// gateway/index.ts
import { router } from '@myorg/server-lib';
import { serviceARouter } from '../services/service-a/router';
import { serviceBRouter } from '../services/service-b/router';

const appRouter = router({
  serviceA: serviceARouter,
  serviceB: serviceBRouter,
});

export type AppRouter = typeof appRouter;
```

The gateway merges routers only for type inference. It does not run as a server process. The client uses the `AppRouter` type for full type safety.

### Client with custom routing link

```ts
// client/client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../gateway';

export const client = createTRPCClient<AppRouter>({
  links: [
    (runtime) => {
      const servers = {
        serviceA: httpBatchLink({ url: 'http://localhost:2021' })(runtime),
        serviceB: httpBatchLink({ url: 'http://localhost:2022' })(runtime),
      };

      return (ctx) => {
        const { op } = ctx;
        const pathParts = op.path.split('.');
        const serverName = pathParts.shift() as keyof typeof servers;
        const path = pathParts.join('.');

        const link = servers[serverName];
        if (!link) {
          throw new Error(
            `Unknown service: ${String(serverName)}. Known: ${Object.keys(servers).join(', ')}`,
          );
        }
        return link({
          ...ctx,
          op: { ...op, path },
        });
      };
    },
  ],
});
```

```ts
// Usage
const greeting = await client.serviceA.greet.query({ name: 'World' });
const status = await client.serviceB.status.query();
```

## Core Patterns

### Path-based routing convention

```ts
(runtime) => {
  const servers = {
    users: httpBatchLink({ url: 'http://users-service:3000' })(runtime),
    billing: httpBatchLink({ url: 'http://billing-service:3000' })(runtime),
    notifications: httpBatchLink({ url: 'http://notifications-service:3000' })(
      runtime,
    ),
  };

  return (ctx) => {
    const { op } = ctx;
    const [serverName, ...rest] = op.path.split('.');
    const link = servers[serverName as keyof typeof servers];

    if (!link) {
      throw new Error(`Unknown service: ${serverName}`);
    }

    return link({
      ...ctx,
      op: { ...op, path: rest.join('.') },
    });
  };
};
```

The first segment of the procedure path (before the first `.`) maps to a service name. The remaining path is forwarded to the target service.

### Adding shared headers across services

```ts
(runtime) => {
  const servers = {
    serviceA: httpBatchLink({
      url: 'http://localhost:2021',
      headers() {
        return { 'x-request-id': crypto.randomUUID() };
      },
    })(runtime),
    serviceB: httpBatchLink({
      url: 'http://localhost:2022',
      headers() {
        return { 'x-request-id': crypto.randomUUID() };
      },
    })(runtime),
  };

  return (ctx) => {
    const [serverName, ...rest] = ctx.op.path.split('.');
    return servers[serverName as keyof typeof servers]({
      ...ctx,
      op: { ...ctx.op, path: rest.join('.') },
    });
  };
};
```

## Common Mistakes

### MEDIUM Path routing assumes first segment is server name

Wrong:

```ts
const serverName = op.path.split('.').shift();
// Breaks if router structure changes or has nested namespaces
```

Correct:

```ts
const [serverName, ...rest] = op.path.split('.');
const link = servers[serverName as keyof typeof servers];
if (!link) {
  throw new Error(`Unknown service: ${serverName}. Known: ${Object.keys(servers).join(', ')}`);
}
return link({ ...ctx, op: { ...op, path: rest.join('.') } });
```

Custom routing links that split on the first path segment break silently if the router structure changes. Add validation and clear error messages when the server name is unrecognized. The path convention must be documented and enforced across teams.

Source: examples/soa/client/client.ts

## See Also

- **server-setup** -- single `initTRPC.create()` instance shared across services
- **links** -- `httpBatchLink`, custom link authoring
- **client-setup** -- `createTRPCClient`, type-safe client with `AppRouter`
- **adapter-standalone** -- running individual service servers
