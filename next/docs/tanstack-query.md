# TanStack Query

`@trpcdev/tanstack-query` makes plain TanStack options objects, so it works with every adapter. Each adapter package (`@trpcdev/tanstack-react-query`, `-preact-`, `-vue-`, `-solid-`, `-svelte-`, `-angular-`, `-lit-query`) re-exports it and adds context helpers and `useSubscription`.

```ts
import { createTrpcQueryUtils } from '@trpcdev/tanstack-query';

export const trpc = createTrpcQueryUtils({ client });

useQuery(trpc.post.byId.queryOptions({ input: { id } }));
useInfiniteQuery(
  trpc.post.list.infiniteOptions({
    input: (cursor) => ({ limit: 10, cursor }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor,
  }),
);
useMutation(trpc.post.create.mutationOptions());
await queryClient.invalidateQueries(trpc.post.pathFilter());
```

Pass what links read in `context`, kept apart from TanStack's own options: `trpc.post.byId.queryOptions({ input, context: { dedupe: false } })`.

With React, a client made per request or per test goes through context:

```tsx
export const { TrpcProvider, useTrpc } = createTrpcContext<AppRouter>();

<QueryClientProvider client={queryClient}>
  <TrpcProvider client={client}>
    <App />
  </TrpcProvider>
</QueryClientProvider>;
```

## Hydration

`hydrationOptions()` returns `{ dehydrate, hydrate }` options that serialize data with danSON, so `Date`, `Map`, `Set`, `bigint` and custom types survive the trip, and that dehydrate pending queries.

```ts
new QueryClient({ defaultOptions: hydrationOptions() });
```

For React Server Components, see [Server Actions and RSC](./actions-and-rsc.md).
