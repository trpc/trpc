---
title: Vue
description: '`@trpc12/experimental-tanstack-vue-query`: a Vue plugin or `provideTrpc()` for the client, `useTrpc()` in setup, and `useSubscription` with refs.'
section: Integrations
parent: integrations/tanstack-query
order: 3
experiment: tanstack-query-frameworks
---

`@trpc12/experimental-tanstack-vue-query` re-exports [`@trpc12/tanstack-query`](../tanstack-query.md) and adds an app plugin (or `provideTrpc()`) that provides a client and its helpers, and a `useSubscription` that returns refs.

```package-install
@trpc12/trpc effect @trpc12/experimental-tanstack-vue-query @tanstack/vue-query
```

The [`examples/experimental/framework-matrix`](../../../../examples/experimental/framework-matrix/README.md) app has a page per adapter (Vue, Solid and Svelte) on one server.

## Provide the client

`createTrpcContext` takes the type of the function that makes the client (or of the client, or the router), so the helpers get what its links declare. Install its plugin next to `VueQueryPlugin`:

```ts twoslash
// ---cut-start---
import { createApp, type Component } from 'vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createTrpcContext } from '@trpc12/experimental-tanstack-vue-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
declare const App: Component;
// ---cut-end---
// trpc.ts
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const { TrpcPlugin, useTrpc, useTrpcClient } =
  createTrpcContext<typeof makeClient>();

// main.ts
createApp(App)
  .use(VueQueryPlugin)
  .use(TrpcPlugin, { client: makeClient() })
  .mount('#app');
```

`provideTrpc(client)` provides it to one component's descendants instead, for a client per subtree or per test. `useTrpcClient()` returns the client itself, for calls outside TanStack Query.

## Queries and mutations

Pass a getter to `useQuery`, so the options follow reactive input; a new input is a new key:

```ts twoslash
// ---cut-start---
import { ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { createTrpcContext } from '@trpc12/experimental-tanstack-vue-query';
import type { AppRouter } from './server.ts';
const useTrpc = createTrpcContext<AppRouter>().useTrpc;
// ---cut-end---
// in <script setup>
const trpc = useTrpc();
const queryClient = useQueryClient();
const id = ref('1');

const post = useQuery(() =>
  trpc.post.byId.queryOptions({ input: { id: id.value } }),
);
post.data.value?.title;
//               ^?
const create = useMutation(
  trpc.post.create.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
  }),
);
```

## Subscriptions

`useSubscription` subscribes while the component is mounted (or the effect scope is active) and returns refs: `status`, `data` (the latest event) and `error`, with `reset()`. Pass a getter or a ref, and a new input restarts it:

```ts twoslash
// ---cut-start---
import { computed, ref } from 'vue';
import {
  createTrpcContext,
  useSubscription,
} from '@trpc12/experimental-tanstack-vue-query';
import { tracked } from '@trpc12/trpc/server';
import { z } from 'zod';
import { db, t, type Post } from './server.ts';
declare function onPost(channel: string): AsyncIterable<Post>;
const router = t.router({
  post: {
    onAdd: t.procedure
      .input(z.object({ channel: z.string() }))
      .subscription(async function* (opts) {
        for await (const post of onPost(opts.input.channel))
          yield tracked(post.id, post);
      }),
  },
});
const useTrpc = createTrpcContext<typeof router>().useTrpc;
const trpc = useTrpc();
void db;
// ---cut-end---
const channel = ref('general');
const added = useSubscription(() =>
  trpc.post.onAdd.subscriptionOptions({ input: { channel: channel.value } }),
);
const latest = computed(() =>
  added.status.value === 'connecting'
    ? 'Connecting…'
    : added.data.value?.data.title,
);
```

What subscriptions share, and the query-cache forms (`liveOptions()`, `streamedOptions()`), are in [Subscriptions](./subscriptions.md).
