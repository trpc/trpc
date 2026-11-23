---
id: service-oriented-architecture
title: Service-Oriented Architecture
sidebar_label: Service-Oriented Architecture
slug: /server/service-oriented-architecture
section: "Backend Usage"
order: 28.5
skill:
  name: service-oriented-architecture
  package: "@trpc/server"
  type: composition
  requires:
    - server-setup
    - client-setup
    - links
  description: Break a tRPC backend into multiple services with custom routing
    links that split on the first path segment (op.path.split('.')) to route to
    different backend service URLs. Define a faux gateway router that merges
    service routers for the AppRouter type without running them in the same
    process. Share procedure and router definitions via a server-lib package
    with a single initTRPC instance. Each service runs its own
    standalone/Express/Fastify server.
---

A tRPC backend doesn't have to run as one server. You can split your routers across several services, each deployed on its own, and still call them all through one fully typed client.

:::caution
You probably don't need this. Splitting a tRPC API into services adds moving parts, and every service still has to share the same context type, error formatter and transformer. If you're not sure you need it, stick to a single router and [merge routers](./merging-routers.md) instead.
:::

The setup has four parts:

- a **shared library** that creates the one tRPC instance every service uses
- the **services**, each with its own router and server
- a **faux gateway**, which merges the service routers into one `AppRouter` type but never runs
- a **client** with a custom terminating link that sends each call to the service that owns it

A runnable version is in the [SOA example](https://github.com/trpc/trpc/tree/main/examples/soa).

## 1. Share one tRPC instance

Put `initTRPC` in a library that every service imports. This is what guarantees that the services agree on context, error formatting and transformer, so their routers can be typed together.

```ts twoslash title='server-lib/index.ts'
import { initTRPC } from '@trpc/server';

type Context = {
  requestId?: string;
};

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

## 2. Build and serve each service

Each service defines its own router with the shared helpers and runs its own server. Here they use the [standalone adapter](./adapters/standalone.md), but any adapter works.

```ts twoslash title='server-a/router.ts'
// @filename: server-lib/index.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.context<{ requestId?: string }>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: server-a/router.ts
// ---cut---
import { z } from 'zod';
import { publicProcedure, router } from '../server-lib';

export const serverARouter = router({
  greet: publicProcedure
    .input(z.string())
    .query(({ input }) => ({ greeting: `hello, ${input}!` })),
});
```

```ts twoslash title='server-a/index.ts'
// @filename: server-lib/index.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.context<{ requestId?: string }>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: server-a/router.ts
import { z } from 'zod';
import { publicProcedure, router } from '../server-lib';
export const serverARouter = router({
  greet: publicProcedure.input(z.string()).query(({ input }) => ({ greeting: `hello, ${input}!` })),
});

// @filename: server-a/index.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serverARouter } from './router';

createHTTPServer({
  router: serverARouter,
  createContext() {
    return {};
  },
}).listen(2021);
```

`server-b` looks the same, with its own router, `serverBRouter`, listening on port 2022.

## 3. Combine the types in a faux gateway

The gateway merges the service routers under one name each, and exports the result's type. It's never deployed or run: the client only imports its `AppRouter` type, so none of the services' code ends up in the client.

```ts twoslash title='faux-gateway/index.ts'
// @filename: server-lib/index.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.context<{ requestId?: string }>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: server-a/router.ts
import { z } from 'zod';
import { publicProcedure, router } from '../server-lib';
export const serverARouter = router({
  greet: publicProcedure.input(z.string()).query(({ input }) => ({ greeting: `hello, ${input}!` })),
});

// @filename: server-b/router.ts
import { publicProcedure, router } from '../server-lib';
export const serverBRouter = router({
  status: publicProcedure.query(() => 'ok' as const),
});

// @filename: faux-gateway/index.ts
// ---cut---
import { serverARouter } from '../server-a/router';
import { serverBRouter } from '../server-b/router';
import { router } from '../server-lib';

const appRouter = router({
  serverA: serverARouter,
  serverB: serverBRouter,
});

export type AppRouter = typeof appRouter;
```

## 4. Route calls to the right service

On the client, a [custom link](../client/links.md#creating-a-custom-link) reads the first segment of each procedure path, `serverA` in `serverA.greet`, and forwards the call to that service's link with the segment removed, since the service itself only knows `greet`.

```ts twoslash title='client/client.ts'
// @filename: server-lib/index.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.context<{ requestId?: string }>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: server-a/router.ts
import { z } from 'zod';
import { publicProcedure, router } from '../server-lib';
export const serverARouter = router({
  greet: publicProcedure.input(z.string()).query(({ input }) => ({ greeting: `hello, ${input}!` })),
});

// @filename: server-b/router.ts
import { publicProcedure, router } from '../server-lib';
export const serverBRouter = router({
  status: publicProcedure.query(() => 'ok' as const),
});

// @filename: faux-gateway/index.ts
import { serverARouter } from '../server-a/router';
import { serverBRouter } from '../server-b/router';
import { router } from '../server-lib';
const appRouter = router({ serverA: serverARouter, serverB: serverBRouter });
export type AppRouter = typeof appRouter;

// @filename: client/client.ts
// ---cut---
import { createTRPCClient, httpBatchLink, type TRPCLink } from '@trpc/client';
import type { AppRouter } from '../faux-gateway';

const serviceLink: TRPCLink<AppRouter> = (runtime) => {
  // Created once, so calls to the same service are batched together
  const services = {
    serverA: httpBatchLink<AppRouter>({ url: 'http://localhost:2021' })(runtime),
    serverB: httpBatchLink<AppRouter>({ url: 'http://localhost:2022' })(runtime),
  };

  return (ctx) => {
    const [name, ...rest] = ctx.op.path.split('.');
    const link = services[name as keyof typeof services];
    if (!link) {
      throw new Error(`No service for procedure "${ctx.op.path}"`);
    }
    return link({ ...ctx, op: { ...ctx.op, path: rest.join('.') } });
  };
};

export const client = createTRPCClient<AppRouter>({
  links: [serviceLink],
});
```

Each service gets its own link, so each can have its own options, such as [headers](../client/headers.md). Calls are fully typed through the gateway's `AppRouter`:

```ts twoslash title='client/index.ts'
// @target: esnext
// @filename: server-lib/index.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.context<{ requestId?: string }>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: server-a/router.ts
import { z } from 'zod';
import { publicProcedure, router } from '../server-lib';
export const serverARouter = router({
  greet: publicProcedure.input(z.string()).query(({ input }) => ({ greeting: `hello, ${input}!` })),
});

// @filename: server-b/router.ts
import { publicProcedure, router } from '../server-lib';
export const serverBRouter = router({
  status: publicProcedure.query(() => 'ok' as const),
});

// @filename: faux-gateway/index.ts
import { serverARouter } from '../server-a/router';
import { serverBRouter } from '../server-b/router';
import { router } from '../server-lib';
const appRouter = router({ serverA: serverARouter, serverB: serverBRouter });
export type AppRouter = typeof appRouter;

// @filename: client/client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../faux-gateway';
export const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:2021' })],
});

// @filename: client/index.ts
// ---cut---
import { client } from './client';

const { greeting } = await client.serverA.greet.query('tRPC');
//      ^?
const status = await client.serverB.status.query();
//    ^?
```

## Common mistakes

- **Forwarding the full path.** If the link doesn't strip the service name, the service is asked for `serverA.greet` and answers with `No procedure found on path "serverA.greet"`.
- **Creating the service links per call.** `httpBatchLink(...)(runtime)` sets up a new batch queue each time it runs, so create the service links once, in the setup function, as shown above. Otherwise nothing gets batched.
- **Using a separate `initTRPC` in each service.** The gateway's `AppRouter` can only describe one context, error shape and transformer, so give every service the same instance from the shared library.
- **Leaving the router type off the service links.** Links created inside a custom link aren't checked against your router. Pass `<AppRouter>`, as in `httpBatchLink<AppRouter>(...)`, so TypeScript still requires a [transformer](./data-transformers.md) when you use one.
- **Running the gateway.** The faux gateway only exists for its type. Each service serves its own router, and the client talks to the services directly.
