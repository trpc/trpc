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

A refetch that returns equal data keeps the old reference, `Date`s, `Map`s and `Set`s included, so it doesn't re-render. `queryOptions()` sets `structuralSharing` for that; it's exported for other queries.

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

## Two APIs, one QueryClient

Keys start with the procedure path (`[['post', 'byId'], { input, type }]`), so two tRPC APIs with a `post.byId` would share cache entries. Give one a `keyPrefix`:

```ts
const billing = createTrpcQueryUtils({
  client: billingClient,
  keyPrefix: 'billing',
});
billing.post.byId.queryKey({ input: { id } }); // [['billing', 'post', 'byId'], { input: { id }, type: 'query' }]
billing.pathFilter(); // matches only billing's queries
```

`createTrpcContext<BillingRouter>({ keyPrefix: 'billing' })` and `createTrpcRsc({ keyPrefix })` take it too; the server and browser must use the same one.

## Streamed mutations

A mutation that returns an async iterable (an AI reply, say) can fill in as it streams:

```ts
const send = useMutation(trpc.chat.send.streamedMutationOptions());
const { data: chunks = [] } = useQuery(trpc.chat.send.chunksOptions());

send.mutate({ text });
// chunks: [] → ['ok'] → ['ok', 'hi'], then send.data is ['ok', 'hi']
```

`chunksOptions()` never fetches; it reads what the mutation writes to `streamedMutationKey()`. Each `mutate` starts the chunks over. Pass `onChunk(chunk, chunks)` to act on each one. Resetting or unmounting doesn't stop the stream on the server; to stop it, call `client.chat.send.mutate(input, { signal })` yourself and abort the signal, which rejects the stream with `CLIENT_CLOSED_REQUEST`.

## Offline mutations

A paused mutation that was persisted (with `persistQueryClient`, say) can only resume if the restored client knows its `mutationFn`. `mutationOptions()` returns the key and the function, so register them as defaults:

```ts
const createPost = trpc.post.create.mutationOptions();
queryClient.setMutationDefaults(createPost.mutationKey, createPost);
// after restoring: await queryClient.resumePausedMutations();
```

## Hydration

`hydrationOptions()` returns `{ dehydrate, hydrate }` options that serialize data with danSON, so `Date`, `Map`, `Set`, `bigint` and custom types survive the trip, and that dehydrate pending queries.

```ts
new QueryClient({ defaultOptions: hydrationOptions() });
```

For React Server Components, see [Server Actions and RSC](./actions-and-rsc.md).
