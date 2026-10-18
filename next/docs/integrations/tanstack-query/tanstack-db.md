---
title: TanStack DB
description: A TanStack DB query collection over a procedure's queryOptions(), with optimistic inserts that call mutations.
section: Integrations
parent: integrations/tanstack-query
order: 12
---

A [query collection](https://tanstack.com/db/latest/docs/collections/query-collection) takes a query key and function, so `queryOptions()` plugs in without an adapter. Rows keep the serializer's types (a `Date` stays a `Date`), and the collection's handlers call mutations:

```package-install
@tanstack/db @tanstack/query-db-collection
```

```ts twoslash
// ---cut-start---
import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { appRouter, db, t } from './server.ts';
const router = {
  post: {
    ...appRouter.post,
    list: t.procedure
      .input(z.object({ limit: z.number(), cursor: z.string().optional() }))
      .query((opts) => {
        const items = db.post.list().slice(0, opts.input.limit);
        return { items, nextCursor: items.at(-1)?.id };
      }),
  },
};
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
const trpc = createTrpcQueryUtils({ client });
declare const queryClient: QueryClient;
// ---cut-end---
import { createCollection } from '@tanstack/db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';

const list = trpc.post.list.queryOptions({ input: { limit: 50 } });

const posts = createCollection(
  queryCollectionOptions({
    queryKey: list.queryKey,
    queryFn: list.queryFn,
    select: (data) => data.items,
    queryClient,
    getKey: (post) => post.id,
    onInsert: async (opts) => {
      for (const mutation of opts.transaction.mutations) {
        await client.post.create.mutate({ title: mutation.modified.title });
      }
    },
  }),
);
```

`posts.insert(...)` shows the row at once, and the collection refetches `post.list` once `onInsert` resolves. The query lives in the same `QueryClient`, so `invalidateQueries` with the tRPC key refreshes the collection too.
