# `@trpc12/experimental-tanstack-db`

TanStack DB collections synced by a tRPC subscription: a snapshot replaces the rows, then each change writes one, and a mutation handler waits until its change arrives. The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-tanstack-db @tanstack/db
```

```ts
import { createCollection } from '@tanstack/db';
import { liveCollectionOptions } from '@trpc12/experimental-tanstack-db';

const posts = createCollection(
  liveCollectionOptions({
    subscribe: (opts) => client.post.live.subscribe(undefined, opts),
    getKey: (post) => post.id,
    onInsert: async (opts) => {
      const created = await client.post.create.mutate(
        opts.transaction.mutations[0].modified,
      );
      await opts.collection.utils.awaitEventId(created.eventId);
    },
  }),
);
```

## Docs

- [TanStack DB](https://v12.trpc.io/v12/docs/integrations/tanstack-query/tanstack-db)
- [Subscriptions](https://v12.trpc.io/v12/docs/subscriptions/overview)
