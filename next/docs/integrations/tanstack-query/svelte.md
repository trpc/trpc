---
title: Svelte
description: '@trpc12/tanstack-svelte-query: context helpers for the client, useTrpc() in components, and createSubscription with runes.'
section: Integrations
parent: integrations/tanstack-query
order: 5
---

`@trpc12/tanstack-svelte-query` re-exports [`@trpc12/tanstack-query`](../tanstack-query.md) and adds context helpers for a client and its helpers, and a `createSubscription` whose fields follow `$state`. It's for Svelte 5 and `@tanstack/svelte-query` 6.

```package-install
@trpc12/trpc effect @trpc12/tanstack-svelte-query @tanstack/svelte-query
```

## Provide the client

`createTrpcContext` takes the type of the function that makes the client (or of the client, or the router), so the helpers get what its links declare. It returns `[useTrpc, setTrpcContext, useTrpcClient]`, in the order of Svelte's `createContext()`:

```ts twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-svelte-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
// ---cut-end---
// trpc.ts
export const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const [useTrpc, setTrpcContext] = createTrpcContext<typeof makeClient>();
```

Call `setTrpcContext(client)` during a parent component's init, next to `QueryClientProvider`; it returns the helpers too:

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { makeClient, setTrpcContext } from './trpc.ts';
  import Post from './Post.svelte';

  setTrpcContext(makeClient());
</script>

<QueryClientProvider client={new QueryClient()}>
  <Post id="1" />
</QueryClientProvider>
```

## Queries and mutations

Pass a getter to `createQuery`, so the options follow `$state` and `$props`; a new input is a new key:

```svelte
<!-- Post.svelte -->
<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { useTrpc } from './trpc.ts';

  let { id }: { id: string } = $props();
  const trpc = useTrpc();
  const queryClient = useQueryClient();

  const post = createQuery(() => trpc.post.byId.queryOptions({ input: { id } }));
  const create = createMutation(() =>
    trpc.post.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
    }),
  );
</script>

<h1>{post.data?.title}</h1>
<button onclick={() => create.mutate({ title: 'New' })}>New post</button>
```

## Subscriptions

`createSubscription` subscribes while the component is mounted, and not during SSR. Its `status`, `data` (the latest event) and `error` follow `$state`, so read them as fields rather than destructuring. The getter is tracked, and a new input restarts the subscription:

```svelte
<script lang="ts">
  import { createSubscription } from '@trpc12/tanstack-svelte-query';
  import { useTrpc } from './trpc.ts';

  let { from }: { from: number } = $props();
  const trpc = useTrpc();
  const ticks = createSubscription(() =>
    trpc.clock.ticks.subscriptionOptions({ input: { from } }),
  );
</script>

<p>{ticks.data}</p>
```

What subscriptions share, and the query-cache forms (`liveOptions()`, `streamedOptions()`), are in [Subscriptions](./subscriptions.md).
