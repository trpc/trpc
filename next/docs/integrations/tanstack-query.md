---
title: TanStack Query
description: Query and mutation options for every TanStack Query framework, with streamed mutations, subscriptions and hydration.
section: Integrations
order: 1
v11: client/tanstack-react-query
---

`@trpc12/tanstack-query` makes plain TanStack options objects, so it works with every adapter. Each adapter package (`@trpc12/tanstack-react-query`, `-preact-`, `-vue-`, `-solid-`, `-svelte-`, `-angular-`, `-lit-query`) re-exports it and adds context helpers and `useSubscription`.

```package-install
@trpc12/trpc @trpc12/tanstack-react-query @tanstack/react-query
```

```ts twoslash
// ---cut-start---
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQueries,
  useQuery,
} from '@tanstack/react-query';
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
declare const queryClient: QueryClient;
declare const id: string;
declare const ids: string[];
// ---cut-end---
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';

export const trpc = createTrpcQueryUtils({ client });

useQuery(trpc.post.byId.queryOptions({ input: { id } }));
useInfiniteQuery(
  trpc.post.list.infiniteOptions({
    input: (cursor: string | undefined) => ({ limit: 10, cursor }),
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

Pass what links read in `context`, kept apart from TanStack's own options: `trpc.post.byId.queryOptions({ input, context: { dedupe: false } })` ([Call options](../client/overview.md#call-options)).

Queries and infinite queries pass TanStack's `signal` to the call, so TanStack [cancels](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) a fetch that nothing observes any more (the component unmounted, or the input changed) and the server's `signal` aborts too. `queryClient.cancelQueries()` does the same. A cancelled query goes back to its previous state rather than caching a late result. This was v11's `abortOnUnmount: true`.

## With React context

Queries and infinite queries pass TanStack's `signal` to the call, so TanStack [cancels](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) a fetch that nothing observes any more (the component unmounted, or the input changed) and the server's `signal` aborts too. `queryClient.cancelQueries()` does the same. A cancelled query goes back to its previous state rather than caching a late result. This was v11's `abortOnUnmount: true`.

With React, a client made per request or per test goes through context. `createTrpcContext` takes one type argument: the type of the function that makes the client (or of the client itself), so the helpers get what its links declare (call-option context, errors, the serializer's form). A router type works too, `createTrpcContext<AppRouter>()`. React and Preact return `[TrpcProvider, useTrpc, useTrpcClient, context]`, to name as you like:

```tsx twoslash
// ---cut-start---
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
declare const url: string;
declare const queryClient: QueryClient;
declare function App(): React.ReactNode;
declare const client: ReturnType<typeof makeClient>;
// ---cut-end---
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

<QueryClientProvider client={queryClient}>
  <TrpcProvider client={client}>
    <App />
  </TrpcProvider>
</QueryClientProvider>;
```

## Two APIs, one QueryClient

Keys start with the procedure path (`[['post', 'byId'], { input, type }]`), so two tRPC APIs with a `post.byId` would share cache entries. Give one a `keyPrefix`:

```ts twoslash
// ---cut-start---
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
const billingClient = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/billing/trpc' })],
});
declare const id: string;
// ---cut-end---
const billing = createTrpcQueryUtils({
  client: billingClient,
  keyPrefix: 'billing',
});
billing.post.byId.queryKey({ input: { id } }); // [['billing', 'post', 'byId'], { input: { id }, type: 'query' }]
billing.pathFilter(); // matches only billing's queries
```

`const [BillingProvider, useBilling] = createTrpcContext<typeof makeBillingClient>({ keyPrefix: 'billing' })` and `createTrpcRsc({ keyPrefix })` take it too; the server and browser must use the same one.

## Streamed mutations

A mutation that returns an async iterable (an AI reply, say) can fill in as it streams:

```ts twoslash
// ---cut-start---
import { useMutation, useQuery } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  chat: {
    send: t.procedure
      .input(z.object({ text: z.string() }))
      .mutation(async function* () {
        yield 'ok';
        yield 'hi';
      }),
  },
};
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
declare const text: string;
// ---cut-end---
const send = useMutation(trpc.chat.send.streamedMutationOptions());
const chunks = useQuery(trpc.chat.send.chunksOptions());

send.mutate({ text });
// chunks.data: ['ok'] → ['ok', 'hi'], then send.data is ['ok', 'hi']
```

`chunksOptions()` never fetches; it reads what the mutation writes to `streamedMutationKey()`. Each `mutate` starts the chunks over. Pass `onChunk(chunk, chunks)` to act on each one.

Resetting the mutation doesn't stop the stream on the server. Two options do, and in both `data` is the chunks so far:

```ts twoslash
// ---cut-start---
import { useRef } from 'react';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  chat: {
    send: t.procedure
      .input(z.object({ text: z.string() }))
      .mutation(async function* () {
        yield 'ok';
      }),
  },
};
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
// ---cut-end---
// stop when the last chunksOptions() reader unmounts
trpc.chat.send.streamedMutationOptions({ abortWhenUnobserved: true });

// stop on demand: a function gives each mutate() its own signal
const stop = useRef<AbortController>(undefined);
trpc.chat.send.streamedMutationOptions({
  signal: () => (stop.current = new AbortController()).signal,
});
stop.current?.abort();
```

### Long jobs

A stream tied to one screen fits a streamed mutation. A job that should outlive the screen, be resumed after a reload, or be watched from several tabs fits a mutation that starts it, a `tracked()` subscription for its progress, and a mutation that cancels it:

```ts twoslash
// ---cut-start---
import { skipToken, useMutation } from '@tanstack/react-query';
import {
  createTrpcQueryUtils,
  useSubscription,
} from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { tracked } from '@trpc12/trpc/server';
import { z } from 'zod';
import { t } from './server.ts';
const Params = z.object({ size: z.number() });
interface Step {
  id: string;
  done: number;
}
declare const jobs: {
  start(params: z.infer<typeof Params>): Promise<{ id: string }>;
  watch(id: string, opts: { after?: string }): AsyncIterable<Step>;
  cancel(id: string): Promise<void>;
};
// ---cut-end---
const job = {
  start: t.procedure.input(Params).mutation((opts) => jobs.start(opts.input)), // { id }
  progress: t.procedure
    .input(z.object({ id: z.string() }))
    .subscription(async function* (opts) {
      const steps = jobs.watch(opts.input.id, { after: opts.lastEventId });
      for await (const step of steps) yield tracked(step.id, step);
    }),
  cancel: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation((opts) => jobs.cancel(opts.input.id)),
};
// ---cut-start---
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<{ job: typeof job }>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
// ---cut-end---

const start = useMutation(trpc.job.start.mutationOptions());
const progress = useSubscription(
  trpc.job.progress.subscriptionOptions({
    input: start.data ? { id: start.data.id } : skipToken,
  }),
);
```

Unsubscribing stops watching, not the job. Keep jobs in a [Publisher](../subscriptions/publisher.md) so any instance can stream them.

## Subscriptions

`useSubscription(trpc.x.subscriptionOptions(...))` gives `status` (`idle`, `connecting`, `active`, `error`), the latest event as `data`, `error` and `reset()`. Components with the same client and key share one subscription. A late one starts from the current state, each component's `onData` runs for every later event, `reset()` restarts it for all of them, and it closes when the last one unmounts. Pass `subscriptionCache: undefined` to give an observer its own.

`liveOptions()` (the latest event) and `streamedOptions()` (every event, capped by `maxChunks`) put the subscription in TanStack's cache instead, for `useQuery`.

## Offline mutations

A paused mutation that was persisted (with `persistQueryClient`, say) can only resume if the restored client knows its `mutationFn`. `mutationOptions()` returns the key and the function, so register them as defaults:

```ts twoslash
// ---cut-start---
import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { client } from './client.ts';
const trpc = createTrpcQueryUtils({ client });
declare const queryClient: QueryClient;
// ---cut-end---
const createPost = trpc.post.create.mutationOptions();
queryClient.setMutationDefaults(createPost.mutationKey, createPost);
// after restoring: await queryClient.resumePausedMutations();
```

## TanStack DB

A [query collection](https://tanstack.com/db/latest/docs/collections/query-collection) takes a query key and function, so `queryOptions()` plugs in without an adapter. Rows keep the serializer's types (a `Date` stays a `Date`), and the collection's handlers call mutations:

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

## Hydration

`hydrationOptions({ client })` returns `{ dehydrate, hydrate }` options that serialize data with the client's [serializer](../server/serializers.md), so the types it keeps (with danSON: `Date`, `Map`, `Set`, `bigint`, custom types) survive the trip, and that dehydrate pending queries. Their data is serialized once it settles. Without `client` it uses plain JSON; `serializer` overrides both.

```ts twoslash
// ---cut-start---
import { QueryClient } from '@tanstack/react-query';
import { hydrationOptions } from '@trpc12/tanstack-query';
import { client } from './client.ts';
// ---cut-end---
new QueryClient({ defaultOptions: hydrationOptions({ client }) });
```

For React Server Components, see [React Server Components](./rsc.md).
