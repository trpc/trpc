---
title: Solid
description: '`@trpc12/experimental-tanstack-solid-query`: a context provider for the client, `useTrpc()` in components, and `useSubscription` with reactive getters.'
section: Integrations
parent: integrations/tanstack-query
order: 4
experiment: tanstack-query-frameworks
---

`@trpc12/experimental-tanstack-solid-query` re-exports [`@trpc12/tanstack-query`](../tanstack-query.md) and adds a context for a client and its helpers, and a `useSubscription` whose fields are reactive.

```package-install
@trpc12/trpc effect @trpc12/experimental-tanstack-solid-query @tanstack/solid-query
```

The [`examples/experimental/framework-matrix`](../../../../examples/experimental/framework-matrix/README.md) app has a page per adapter (Vue, Solid and Svelte) on one server.

## Provide the client

`createTrpcContext` takes the type of the function that makes the client (or of the client, or the router), so the helpers get what its links declare. It returns `[TrpcProvider, useTrpc, useTrpcClient]`, to name as you like; render the provider inside `QueryClientProvider`:

```tsx twoslash
// @jsx: preserve
// @jsxImportSource: solid-js
// ---cut-start---
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { createTrpcContext } from '@trpc12/experimental-tanstack-solid-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { JSX } from 'solid-js';
import type { AppRouter } from './server.ts';
declare function App(): JSX.Element;
// ---cut-end---
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

const queryClient = new QueryClient();
const client = makeClient();

export const Root = () => (
  <QueryClientProvider client={queryClient}>
    <TrpcProvider client={client}>
      <App />
    </TrpcProvider>
  </QueryClientProvider>
);
```

## Queries and mutations

Pass an accessor to `useQuery`, so the options follow signals and props; a new input is a new key:

```tsx twoslash
// @jsx: preserve
// @jsxImportSource: solid-js
// ---cut-start---
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createTrpcContext } from '@trpc12/experimental-tanstack-solid-query';
import type { AppRouter } from './server.ts';
const [, useTrpc] = createTrpcContext<AppRouter>();
// ---cut-end---
function Post(props: { id: string }) {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const post = useQuery(() =>
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  const create = useMutation(() =>
    trpc.post.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
    }),
  );
  return (
    <button onClick={() => create.mutate({ title: 'New' })}>
      {post.data?.title}
    </button>
  );
}
```

## Subscriptions

`useSubscription` subscribes while the component is mounted. Its `status`, `data` (the latest event) and `error` are reactive getters, like `useQuery`'s result, so don't destructure them. The accessor is tracked, and a new input restarts the subscription:

```tsx twoslash
// @jsx: preserve
// @jsxImportSource: solid-js
// ---cut-start---
import {
  createTrpcContext,
  useSubscription,
} from '@trpc12/experimental-tanstack-solid-query';
import { z } from 'zod';
import { t } from './server.ts';
const router = t.router({
  clock: {
    ticks: t.procedure
      .input(z.object({ from: z.number() }))
      .subscription(async function* (opts) {
        for (let n = opts.input.from; ; n++) yield n;
      }),
  },
});
const [, useTrpc] = createTrpcContext<typeof router>();
// ---cut-end---
function Ticker(props: { from: number }) {
  const trpc = useTrpc();
  const ticks = useSubscription(() =>
    trpc.clock.ticks.subscriptionOptions({ input: { from: props.from } }),
  );
  return <p>{ticks.data}</p>;
}
```

What subscriptions share, and the query-cache forms (`liveOptions()`, `streamedOptions()`), are in [Subscriptions](./subscriptions.md).
