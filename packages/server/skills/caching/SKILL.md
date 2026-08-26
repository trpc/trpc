---
name: caching
description: >
  Set HTTP cache headers on tRPC query responses via responseMeta callback for
  CDN and browser caching. Configure Cache-Control, s-maxage,
  stale-while-revalidate. Handle caching with batching and authenticated requests.
  Avoid caching mutations, errors, and authenticated responses.
type: core
library: trpc
library_version: '11.16.0'
requires:
  - server-setup
sources:
  - 'trpc/trpc:www/docs/server/caching.md'
---

# tRPC -- Caching

## Setup

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export const createContext = async (opts: CreateHTTPContextOptions) => {
  return {
    req: opts.req,
    res: opts.res,
    user: null as { id: string } | null,
  };
};

type Context = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts
// server/appRouter.ts
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  public: router({
    slowQueryCached: publicProcedure.query(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return { lastUpdated: new Date().toJSON() };
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

```ts
// server/index.ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';
import { createContext } from './trpc';

const server = createHTTPServer({
  router: appRouter,
  createContext,
  responseMeta(opts) {
    const { paths, errors, type } = opts;

    const allPublic =
      paths && paths.every((path) => path.startsWith('public.'));
    const allOk = errors.length === 0;
    const isQuery = type === 'query';

    if (allPublic && allOk && isQuery) {
      const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
      return {
        headers: new Headers([
          [
            'cache-control',
            `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
          ],
        ]),
      };
    }
    return {};
  },
});

server.listen(3000);
```

## Core Patterns

### Path-based public route caching

```ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';
import { createContext } from './trpc';

const server = createHTTPServer({
  router: appRouter,
  createContext,
  responseMeta({ paths, errors, type }) {
    const allPublic =
      paths && paths.every((path) => path.startsWith('public.'));
    const allOk = errors.length === 0;
    const isQuery = type === 'query';

    if (allPublic && allOk && isQuery) {
      return {
        headers: new Headers([
          ['cache-control', 's-maxage=1, stale-while-revalidate=86400'],
        ]),
      };
    }
    return {};
  },
});
```

Name public routes with a `public` prefix (e.g., `public.slowQueryCached`) so `responseMeta` can identify them by path.

### Skip caching for authenticated requests

```ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';
import { createContext } from './trpc';

const server = createHTTPServer({
  router: appRouter,
  createContext,
  responseMeta({ ctx, errors, type }) {
    if (ctx?.user || errors.length > 0 || type !== 'query') {
      return {};
    }
    return {
      headers: new Headers([
        ['cache-control', 's-maxage=1, stale-while-revalidate=86400'],
      ]),
    };
  },
});
```

## Common Mistakes

### [CRITICAL] Caching authenticated responses

Wrong:

```ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';

const server = createHTTPServer({
  router: appRouter,
  responseMeta() {
    return {
      headers: new Headers([['cache-control', 's-maxage=60']]),
    };
  },
});
```

Correct:

```ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';
import { createContext } from './trpc';

const server = createHTTPServer({
  router: appRouter,
  createContext,
  responseMeta({ ctx, errors, type }) {
    if (ctx?.user || errors.length > 0 || type !== 'query') {
      return {};
    }
    return {
      headers: new Headers([
        ['cache-control', 's-maxage=1, stale-while-revalidate=86400'],
      ]),
    };
  },
});
```

With batching enabled by default, a cached response containing personal data could be served to other users; always check for auth context, errors, and request type before setting cache headers.

Source: www/docs/server/caching.md

### [HIGH] Next.js App Router overrides Cache-Control headers

There is no code fix for this -- Next.js App Router overrides `Cache-Control` headers set by tRPC via `responseMeta`. The documented caching approach using `responseMeta` does not work as expected in App Router. Use Next.js native caching mechanisms (`revalidate`, `unstable_cache`) instead when deploying on App Router.

Source: https://github.com/trpc/trpc/issues/5625

## See Also

- `server-setup` -- initTRPC, createContext configuration
- `adapter-standalone` -- responseMeta option on createHTTPServer
- `adapter-fetch` -- responseMeta option on fetchRequestHandler
- `links` -- splitLink to separate public/private requests on the client
