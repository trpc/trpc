---
title: Preact
description: '`@trpc12/experimental-tanstack-preact-query`: a context provider for the client, `useTrpc()` in components, and `useSubscription`.'
section: Integrations
parent: integrations/tanstack-query
order: 2
experiment: tanstack-query-frameworks
---

`@trpc12/experimental-tanstack-preact-query` re-exports [`@trpc12/tanstack-query`](../tanstack-query.md) and adds a context for a client and its helpers, and a `useSubscription` hook. It works as the [React](./react.md) package does, with Preact's hooks.

```package-install
@trpc12/trpc effect @trpc12/experimental-tanstack-preact-query @tanstack/preact-query
```

## Provide the client

An app with one client can call `createTrpcQueryUtils({ client })` in a module and import the helpers. For a client per request or per test, `createTrpcContext` takes the type of the function that makes the client (or of the client, or the router), so the helpers get what its links declare. It returns `[TrpcProvider, useTrpc, useTrpcClient, context]`, to name as you like; render the provider inside `QueryClientProvider`:

```tsx twoslash
// @jsxImportSource: preact
// ---cut-start---
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/preact-query';
import { createTrpcContext } from '@trpc12/experimental-tanstack-preact-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { ComponentChildren } from 'preact';
import type { AppRouter } from './server.ts';
// ---cut-end---
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

const queryClient = new QueryClient();
const client = makeClient();

export const Providers = (props: { children: ComponentChildren }) => (
  <QueryClientProvider client={queryClient}>
    <TrpcProvider client={client}>{props.children}</TrpcProvider>
  </QueryClientProvider>
);

function Post(props: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  return <h1>{post.data?.title}</h1>;
}
```

The fourth item is the Preact context itself, for bridging it into another render tree: read it with `useContext`, then provide that value on the other side.

## Subscriptions

`useSubscription` subscribes while the component is mounted, with `status`, `data` (the latest event), `error` and `reset()`. A new input or `enabled` restarts it; callbacks can change freely:

```tsx twoslash
// @jsxImportSource: preact
// ---cut-start---
import {
  createTrpcContext,
  useSubscription,
} from '@trpc12/experimental-tanstack-preact-query';
import { t, type Post } from './server.ts';
declare function onPost(): AsyncIterable<Post>;
const router = t.router({
  post: {
    onAdd: t.procedure.subscription(async function* () {
      yield* onPost();
    }),
  },
});
const [, useTrpc] = createTrpcContext<typeof router>();
// ---cut-end---
function NewPosts() {
  const trpc = useTrpc();
  const sub = useSubscription(trpc.post.onAdd.subscriptionOptions());
  return <p>{sub.data?.title}</p>;
}
```

What subscriptions share, and the query-cache forms (`liveOptions()`, `streamedOptions()`), are in [Subscriptions](./subscriptions.md).
