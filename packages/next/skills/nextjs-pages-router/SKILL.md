---
name: nextjs-pages-router
description: >
  Set up tRPC in Next.js Pages Router with createNextApiHandler,
  createTRPCNext, withTRPC HOC, SSR via ssr option and ssrPrepass,
  SSG via createServerSideHelpers with getStaticProps, and
  server-side helpers for getServerSideProps prefetching.
type: framework
library: trpc
framework: react
library_version: '11.15.1'
requires:
  - server-setup
  - client-setup
sources:
  - www/docs/client/nextjs/overview.mdx
  - www/docs/server/adapters/nextjs.md
  - examples/next-prisma-starter/
---

This skill builds on [server-setup] and [client-setup]. Read them first for foundational concepts.

# tRPC -- Next.js Pages Router

## File Structure

```
.
├── src
│   ├── pages
│   │   ├── _app.tsx              # withTRPC() HOC
│   │   ├── api/trpc
│   │   │   └── [trpc].ts        # tRPC API handler
│   │   └── index.tsx             # page using tRPC hooks
│   ├── server
│   │   ├── routers
│   │   │   └── _app.ts          # main app router
│   │   ├── context.ts           # createContext
│   │   └── trpc.ts              # initTRPC, procedure helpers
│   └── utils
│       └── trpc.ts              # createTRPCNext, hooks
└── ...
```

## Setup

### 1. Install

```sh
npm install @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query zod
```

### 2. Server init

```ts title="server/trpc.ts"
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const procedure = t.procedure;
```

### 3. Define the router

```ts title="server/routers/_app.ts"
import { z } from 'zod';
import { procedure, router } from '../trpc';

export const appRouter = router({
  hello: procedure.input(z.object({ text: z.string() })).query(({ input }) => ({
    greeting: `hello ${input.text}`,
  })),
});

export type AppRouter = typeof appRouter;
```

### 4. API handler

```ts title="pages/api/trpc/[trpc].ts"
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers/_app';

export default createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
```

### 5. Create tRPC hooks

```ts title="utils/trpc.ts"
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from '../server/routers/_app';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
    };
  },
  ssr: false,
});
```

### 6. Wrap app with withTRPC HOC

```tsx title="pages/_app.tsx"
import type { AppType } from 'next/app';
import { trpc } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default trpc.withTRPC(MyApp);
```

### 7. Use hooks in pages

```tsx title="pages/index.tsx"
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const hello = trpc.hello.useQuery({ text: 'client' });
  if (!hello.data) return <div>Loading...</div>;
  return <p>{hello.data.greeting}</p>;
}
```

## Core Patterns

### SSR with ssr: true

Enable SSR to prefetch all queries on the server automatically. Requires `ssrPrepass` and forwarding client headers.

```ts title="utils/trpc.ts"
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import type { AppRouter } from '../server/routers/_app';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const trpc = createTRPCNext<AppRouter>({
  ssr: true,
  ssrPrepass,
  config({ ctx }) {
    if (typeof window !== 'undefined') {
      return {
        links: [httpBatchLink({ url: '/api/trpc' })],
      };
    }
    return {
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            if (!ctx?.req?.headers) return {};
            return { cookie: ctx.req.headers.cookie };
          },
        }),
      ],
    };
  },
});
```

### SSG with createServerSideHelpers and getStaticProps

```tsx title="pages/posts/[id].tsx"
import { createServerSideHelpers } from '@trpc/react-query/server';
import type {
  GetStaticPaths,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from 'next';
import superjson from 'superjson';
import { appRouter } from '../../server/routers/_app';
import { trpc } from '../../utils/trpc';

export async function getStaticProps(
  context: GetStaticPropsContext<{ id: string }>,
) {
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });
  const id = context.params?.id as string;

  await helpers.post.byId.prefetch({ id });

  return {
    props: {
      trpcState: helpers.dehydrate(),
      id,
    },
    revalidate: 1,
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export default function PostPage(
  props: InferGetStaticPropsType<typeof getStaticProps>,
) {
  const { id } = props;
  const postQuery = trpc.post.byId.useQuery({ id });

  if (postQuery.status !== 'success') return <>Loading...</>;
  return <h1>{postQuery.data.title}</h1>;
}
```

### Server-side helpers with getServerSideProps

```tsx title="pages/posts/[id].tsx"
import { createServerSideHelpers } from '@trpc/react-query/server';
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next';
import superjson from 'superjson';
import { appRouter } from '../../server/routers/_app';
import { trpc } from '../../utils/trpc';

export async function getServerSideProps(
  context: GetServerSidePropsContext<{ id: string }>,
) {
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });
  const id = context.params?.id as string;

  await helpers.post.byId.prefetch({ id });

  return {
    props: {
      trpcState: helpers.dehydrate(),
      id,
    },
  };
}

export default function PostPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  const { id } = props;
  const postQuery = trpc.post.byId.useQuery({ id });

  if (postQuery.status !== 'success') return <>Loading...</>;
  return <h1>{postQuery.data.title}</h1>;
}
```

### SSR response caching

```ts title="utils/trpc.ts"
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import type { AppRouter } from '../server/routers/_app';

export const trpc = createTRPCNext<AppRouter>({
  ssr: true,
  ssrPrepass,
  config() {
    return {
      links: [httpBatchLink({ url: '/api/trpc' })],
    };
  },
  responseMeta(opts) {
    const { clientErrors } = opts;
    if (clientErrors.length) {
      return { status: clientErrors[0].data?.httpStatus ?? 500 };
    }
    const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
    return {
      headers: new Headers([
        [
          'cache-control',
          `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
        ],
      ]),
    };
  },
});
```

### CORS on the API handler

```ts title="pages/api/trpc/[trpc].ts"
import { createNextApiHandler } from '@trpc/server/adapters/next';
import type { NextApiRequest, NextApiResponse } from 'next';
import { appRouter } from '../../../server/routers/_app';

const nextApiHandler = createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  return nextApiHandler(req, res);
}
```

### Limiting batch size with maxBatchSize

```ts title="pages/api/trpc/[trpc].ts"
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers/_app';

export default createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
  maxBatchSize: 10,
});
```

Requests batching more than `maxBatchSize` operations are rejected with a `400 Bad Request` error. Set `maxItems` on your client's `httpBatchLink` to the same value to avoid exceeding the limit.

## Common Mistakes

### Using ssr: true without understanding implications

Enabling `ssr: true` imports `react-dom` and runs `ssrPrepass` on every request, rendering the component tree repeatedly until no queries are fetching. This adds latency and server load. For better control, keep `ssr: false` (the default) and use `createServerSideHelpers` in `getServerSideProps` or `getStaticProps` to selectively prefetch only the queries you need.

### SSR prepass renders multiple times

The SSR prepass loop re-renders the component tree repeatedly until all queries resolve. This is by design but causes performance issues with expensive renders. Keep SSR-rendered pages lightweight, or switch to selective prefetching with server-side helpers.

### Mixing App Router and Pages Router patterns

App Router uses `fetchRequestHandler`, `createTRPCOptionsProxy`, and `@trpc/tanstack-react-query`. Pages Router uses `createNextApiHandler`, `createTRPCNext`, and `@trpc/next`/`@trpc/react-query`. Applying App Router patterns (like `HydrationBoundary` or `prefetchQuery`) in Pages Router, or vice versa, produces non-functional code.

### Forgetting to return trpcState from getStaticProps/getServerSideProps

When using `createServerSideHelpers`, you must return `trpcState: helpers.dehydrate()` in props. Without this, the prefetched data is lost and queries re-fetch on the client.

```ts
// WRONG
return { props: { id } }; // missing trpcState!

// CORRECT
return { props: { trpcState: helpers.dehydrate(), id } };
```

## See Also

- [server-setup] -- initTRPC, routers, procedures, context
- [client-setup] -- vanilla tRPC client, links configuration
- [nextjs-app-router] -- if migrating to or starting with App Router
- [react-query-classic-migration] -- migrating from @trpc/react-query to @trpc/tanstack-react-query
