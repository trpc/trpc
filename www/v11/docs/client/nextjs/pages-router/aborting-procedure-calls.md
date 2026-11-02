---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
description: Cancel in-flight requests when a component unmounts with the abortOnUnmount option on a query
slug: /client/nextjs/pages-router/aborting-procedure-calls
section: "Client Usage"
parent: "client/nextjs/pages-router/setup"
order: 74
---

By default, tRPC doesn't cancel a request when the component that made it unmounts. To cancel it, set `abortOnUnmount` in the `trpc` option of the query:

```tsx twoslash title='pages/posts/[id].tsx'
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure.input(z.object({ id: z.string() })).query(() => ({ id: '1', title: 'Hello' })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: pages/posts/[id].tsx
// ---cut---
import { skipToken, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useTRPC } from '../../utils/trpc';

export default function PostViewPage() {
  const router = useRouter();
  // `query.id` is undefined until the router is ready
  const id = router.query.id;
  const trpc = useTRPC();
  const postQuery = useQuery(
    trpc.post.byId.queryOptions(typeof id === 'string' ? { id } : skipToken, {
      trpc: { abortOnUnmount: true },
    }),
  );

  switch (postQuery.status) {
    case 'pending':
      return <p>Loading...</p>;
    case 'error':
      return <p>Error: {postQuery.error.message}</p>;
    case 'success':
      return <h1>{postQuery.data.title}</h1>;
  }
}
```

There's no global switch: `createTRPCContext()` takes no options, so set it on each query that needs it. It works for `queryOptions` and `infiniteQueryOptions`, since TanStack React Query only cancels queries.

With `httpBatchLink` or `httpBatchStreamLink`, the HTTP request only stops once every query in its batch is cancelled. Cancelling one query alone just drops its result. To stop the request for a single query, send it through `httpLink`, for instance with a [`splitLink`](/docs/client/links/splitLink).

:::note
`createTRPCNext`'s `abortOnUnmount` in `config` set this for every query. Like the rest of `createTRPCNext`, it's deprecated. See [Moving from `createTRPCNext`](./setup.md#moving-from-createtrpcnext).
:::
