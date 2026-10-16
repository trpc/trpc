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
useQueries({
  queries: ids.map((id) => trpc.post.byId.queryOptions({ input: { id } })),
});
useMutationState({
  filters: trpc.post.create.mutationFilter({ status: 'pending' }),
  select: (mutation) => mutation.state.variables,
});
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

`chunksOptions()` never fetches; it reads what the mutation writes to `streamedMutationKey()`. Each `mutate` starts the chunks over. Pass `onChunk(chunk, chunks)` to act on each one.

Resetting the mutation doesn't stop the stream on the server. Two options do, and in both `data` is the chunks so far:

```ts
// stop when the last chunksOptions() reader unmounts
trpc.chat.send.streamedMutationOptions({ abortWhenUnobserved: true });

// stop on demand: a function gives each mutate() its own signal
const stop = useRef<AbortController>();
trpc.chat.send.streamedMutationOptions({
  signal: () => (stop.current = new AbortController()).signal,
});
stop.current?.abort();
```

### Long jobs

A stream tied to one screen fits a streamed mutation. A job that should outlive the screen, be resumed after a reload, or be watched from several tabs fits a mutation that starts it, a `tracked()` subscription for its progress, and a mutation that cancels it:

```ts
const job = {
  start: t.procedure.input(Params).mutation(({ input }) => jobs.start(input)), // { id }
  progress: t.procedure
    .input(z.object({ id: z.string() }))
    .subscription(async function* ({ input, lastEventId }) {
      for await (const step of jobs.watch(input.id, { after: lastEventId }))
        yield tracked(step.id, step);
    }),
  cancel: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => jobs.cancel(input.id)),
};

const start = useMutation(trpc.job.start.mutationOptions());
const progress = useSubscription(
  trpc.job.progress.subscriptionOptions(
    start.data ? { id: start.data.id } : skipToken,
  ),
);
```

Unsubscribing stops watching, not the job. Keep jobs in a [Publisher](./subscriptions.md#publisher) so any instance can stream them.

## Subscriptions

`useSubscription(trpc.x.subscriptionOptions(...))` gives `status` (`idle`, `connecting`, `active`, `error`), the latest event as `data`, `error` and `reset()`. Components with the same client and key share one subscription. A late one starts from the current state, each component's `onData` runs for every later event, `reset()` restarts it for all of them, and it closes when the last one unmounts. Pass `subscriptionCache: undefined` to give an observer its own.

`liveOptions()` (the latest event) and `streamedOptions()` (every event, capped by `maxChunks`) put the subscription in TanStack's cache instead, for `useQuery`.

## Offline mutations

A paused mutation that was persisted (with `persistQueryClient`, say) can only resume if the restored client knows its `mutationFn`. `mutationOptions()` returns the key and the function, so register them as defaults:

```ts
const createPost = trpc.post.create.mutationOptions();
queryClient.setMutationDefaults(createPost.mutationKey, createPost);
// after restoring: await queryClient.resumePausedMutations();
```

## TanStack DB

A [query collection](https://tanstack.com/db/latest/docs/collections/query-collection) takes a query key and function, so `queryOptions()` plugs in without an adapter. Rows keep the serializer's types (a `Date` stays a `Date`), and the collection's handlers call mutations:

```ts
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
    onInsert: async ({ transaction }) => {
      for (const { modified } of transaction.mutations) {
        await client.post.create.mutate({ title: modified.title });
      }
    },
  }),
);
```

`posts.insert(...)` shows the row at once, and the collection refetches `post.list` once `onInsert` resolves. The query lives in the same `QueryClient`, so `invalidateQueries` with the tRPC key refreshes the collection too.

## Hydration

`hydrationOptions({ client })` returns `{ dehydrate, hydrate }` options that serialize data with the client's [serializer](./serializers.md), so the types it keeps (with danSON: `Date`, `Map`, `Set`, `bigint`, custom types) survive the trip, and that dehydrate pending queries. Their data is serialized once it settles. Without `client` it uses plain JSON; `serializer` overrides both.

```ts
new QueryClient({ defaultOptions: hydrationOptions({ client }) });
```

For React Server Components, see [Server Actions and RSC](./actions-and-rsc.md).
