---
title: React
description: '`@trpc12/tanstack-react-query`: the helpers as a module singleton or through context, Suspense, `useSubscription`, and server components.'
section: Integrations
parent: integrations/tanstack-query
order: 1
v11: client/tanstack-react-query/setup
---

`@trpc12/tanstack-react-query` re-exports [`@trpc12/tanstack-query`](../tanstack-query.md) and adds a context for a client and its helpers, a `useSubscription` hook, and server-component helpers in `@trpc12/tanstack-react-query/rsc`.

```package-install
@trpc12/trpc effect @trpc12/tanstack-react-query @tanstack/react-query
```

The [`examples/react-spa`](../../../../examples/react-spa/README.md) app is a Vite single-page app built on this page and the TanStack Query pages: infinite lists, optimistic updates, subscriptions in and out of the cache, offline mutations and two APIs in one `QueryClient`.

## A client for the whole app

A single-page app with one client can make the helpers once, in a module, and import them where it needs them:

```tsx twoslash
// ---cut-start---
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
// ---cut-end---
// trpc.ts
export const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc' })],
});
export const trpc = createTrpcQueryUtils({ client });

// post.tsx
function Post(props: { id: string }) {
  const queryClient = useQueryClient();
  const post = useQuery(
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  const create = useMutation(
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

## A client through context

A client made per request (server rendering) or per test goes through context. `createTrpcContext` takes one type argument: the type of the function that makes the client (or of the client itself), so the helpers get what its links declare (call-option context, errors, the transformer's form). A router type works too, `createTrpcContext<AppRouter>()`. It returns `[TrpcProvider, useTrpc, useTrpcClient, context]`, to name as you like:

```tsx twoslash
// ---cut-start---
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { useState } from 'react';
import type { AppRouter } from './server.ts';
// ---cut-end---
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const [TrpcProvider, useTrpc, useTrpcClient] =
  createTrpcContext<typeof makeClient>();

export function Providers(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TrpcProvider client={client}>{props.children}</TrpcProvider>
    </QueryClientProvider>
  );
}

function Post(props: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  return <h1>{post.data?.title}</h1>;
}
```

`useTrpcClient()` returns the client, for calls outside TanStack Query. The fourth item is the React context itself, for bridging it into another renderer (react-three-fiber, react-pdf): read it with `useContext`, then provide that value on the other side.

## Suspense

The options work with every hook that takes them, `useSuspenseQuery` and `useSuspenseInfiniteQuery` included. `data` is then never `undefined`:

```tsx twoslash
// ---cut-start---
import { useSuspenseQuery } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
import { client } from './client.ts';
const trpc = createTrpcQueryUtils({ client });
// ---cut-end---
function Post(props: { id: string }) {
  const post = useSuspenseQuery(
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  return <h1>{post.data.title}</h1>;
  //                ^?
}
```

## Subscriptions

`useSubscription` subscribes while the component is mounted, with `status`, `data` (the latest event), `error` and `reset()`. A new input or `enabled` restarts it; callbacks can change freely:

```tsx twoslash
// ---cut-start---
import {
  createTrpcQueryUtils,
  useSubscription,
} from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { t, type Post } from './server.ts';
declare function onPost(): AsyncIterable<Post>;
declare function toast(message: string): void;
const router = t.router({
  post: {
    onAdd: t.procedure.subscription(async function* () {
      yield* onPost();
    }),
  },
});
const trpc = createTrpcQueryUtils({
  client: createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: '/trpc' })],
  }),
});
// ---cut-end---
function NewPosts() {
  const sub = useSubscription(
    trpc.post.onAdd.subscriptionOptions({
      onData: (post) => toast(post.title),
    }),
  );
  if (sub.status === 'error') return <button onClick={sub.reset}>Retry</button>;
  return <p>Latest: {sub.data?.title}</p>;
}
```

What subscriptions share, and the query-cache forms (`liveOptions()`, `streamedOptions()`), are in [Subscriptions](./subscriptions.md).

## Server components and Next.js

`createTrpcRsc` from `@trpc12/tanstack-react-query/rsc` prefetches in server components and streams the queries to these hooks ([React Server Components](../rsc.md)). Server Actions don't need TanStack Query ([Server Actions](../server-actions.md)).
