---
name: adapter-fetch
description: >
  Deploy tRPC on WinterCG-compliant edge runtimes with fetchRequestHandler() from
  @trpc/server/adapters/fetch. Supports Cloudflare Workers, Deno Deploy, Vercel
  Edge Runtime, Astro, Remix, SolidStart. FetchCreateContextFnOptions provides
  req (Request) and resHeaders (Headers) for context creation. The endpoint option
  must match the URL path prefix where the handler is mounted.
type: core
library: trpc
library_version: '11.15.1'
requires:
  - server-setup
sources:
  - www/docs/server/adapters/fetch.mdx
  - examples/cloudflare-workers/
  - examples/deno-deploy/
---

# tRPC — Adapter: Fetch / Edge Runtimes

## Setup

```ts
// Cloudflare Worker example
import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { z } from 'zod';

function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  const user = req.headers.get('authorization');
  return { user, resHeaders };
}
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const appRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ greeting: `Hello, ${input.name}!` })),
});

export type AppRouter = typeof appRouter;

export default {
  async fetch(request: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: request,
      router: appRouter,
      createContext,
    });
  },
};
```

## Core Patterns

### Cloudflare Workers

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from './context';
import { appRouter } from './router';

export default {
  async fetch(request: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: request,
      router: appRouter,
      createContext,
    });
  },
};
```

### Astro SSR

```ts
// src/pages/trpc/[trpc].ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { APIRoute } from 'astro';
import { createContext } from '../../server/context';
import { appRouter } from '../../server/router';

export const ALL: APIRoute = (opts) => {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: opts.request,
    router: appRouter,
    createContext,
  });
};
```

### Remix

```ts
// app/routes/trpc.$trpc.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/router';

function handleRequest(args: LoaderFunctionArgs | ActionFunctionArgs) {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: args.request,
    router: appRouter,
    createContext,
  });
}

export const loader = async (args: LoaderFunctionArgs) => handleRequest(args);
export const action = async (args: ActionFunctionArgs) => handleRequest(args);
```

### Deno Deploy

```ts
import { fetchRequestHandler } from 'npm:@trpc/server/adapters/fetch';
import { createContext } from './context.ts';
import { appRouter } from './router.ts';

Deno.serve((request) => {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: request,
    router: appRouter,
    createContext,
  });
});
```

### Limiting batch size with maxBatchSize

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from './context';
import { appRouter } from './router';

export default {
  async fetch(request: Request): Promise<Response> {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: request,
      router: appRouter,
      createContext,
      maxBatchSize: 10,
    });
  },
};
```

Requests batching more than `maxBatchSize` operations are rejected with a `400 Bad Request` error. Set `maxItems` on your client's `httpBatchLink` to the same value to avoid exceeding the limit.

## Common Mistakes

### HIGH Mismatched endpoint path in fetchRequestHandler

Wrong:

```ts
// Handler mounted at /api/trpc/[trpc] but endpoint says /trpc
fetchRequestHandler({
  endpoint: '/trpc',
  req: request,
  router: appRouter,
  createContext,
});
```

Correct:

```ts
// endpoint must match the actual URL path prefix
fetchRequestHandler({
  endpoint: '/api/trpc',
  req: request,
  router: appRouter,
  createContext,
});
```

The `endpoint` option tells tRPC where to strip the URL prefix to extract the procedure name. If it does not match the actual mount path, all procedures return 404 because the path parsing extracts the wrong procedure name.

Source: www/docs/server/adapters/fetch.mdx

## See Also

- **server-setup** -- `initTRPC.create()`, router/procedure definition, context
- **adapter-standalone** -- alternative for Node.js HTTP server
- **adapter-express** -- alternative when Express middleware ecosystem is needed
- **adapter-aws-lambda** -- alternative for AWS Lambda deployments
- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Deno Deploy docs: https://deno.com/deploy/docs
