---
title: TanStack Query
description: Query, mutation and subscription options for every TanStack Query framework, from one package and an adapter per framework.
section: Integrations
order: 1
v11: client/tanstack-react-query
---

`@trpc12/tanstack-query` turns a client into plain TanStack options objects (`queryOptions()`, `mutationOptions()`, keys and filters), so it works with every TanStack adapter. Each framework package re-exports it and adds a way to provide the client to components, and a subscription primitive:

| Framework                              | Package                          | Provide the client                           | Subscribe                      |
| -------------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------ |
| [React](./tanstack-query/react.md)     | `@trpc12/tanstack-react-query`   | `<TrpcProvider>`, `useTrpc()`                | `useSubscription`              |
| [Preact](./tanstack-query/preact.md)   | `@trpc12/tanstack-preact-query`  | `<TrpcProvider>`, `useTrpc()`                | `useSubscription`              |
| [Vue](./tanstack-query/vue.md)         | `@trpc12/tanstack-vue-query`     | `TrpcPlugin` or `provideTrpc()`, `useTrpc()` | `useSubscription`              |
| [Solid](./tanstack-query/solid.md)     | `@trpc12/tanstack-solid-query`   | `<TrpcProvider>`, `useTrpc()`                | `useSubscription`              |
| [Svelte](./tanstack-query/svelte.md)   | `@trpc12/tanstack-svelte-query`  | `setTrpcContext()`, `useTrpc()`              | `createSubscription`           |
| [Angular](./tanstack-query/angular.md) | `@trpc12/tanstack-angular-query` | `provideTrpc()`, `injectTrpc()`              | `injectSubscription`           |
| [Lit](./tanstack-query/lit.md)         | `@trpc12/tanstack-lit-query`     | `<trpc-provider>`, `useTrpc(this)`           | `createSubscriptionController` |

Install the core with your framework's package and TanStack's adapter, for React:

```package-install
@trpc12/trpc @trpc12/tanstack-react-query @tanstack/react-query
```

## The helpers

`createTrpcQueryUtils({ client })` mirrors the client's router: each procedure gets the helpers for its type, and every router and procedure gets `pathKey()` and `pathFilter()`, which match everything under it.

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

| Procedure    | Helpers                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| query        | `queryOptions()`, `queryKey()`, `queryFilter()`, `infiniteOptions()`, `infiniteKey()`                                                                                          |
| mutation     | `mutationOptions()`, `mutationKey()`, `mutationFilter()`, and for a streamed output `streamedMutationOptions()` ([Streamed mutations](./tanstack-query/streamed-mutations.md)) |
| subscription | `subscriptionOptions()`, `liveOptions()`, `streamedOptions()` ([Subscriptions](./tanstack-query/subscriptions.md))                                                             |

`input: skipToken` disables a query or a subscription. The options take TanStack's own options next to `input` (`staleTime`, `select`, `onSuccess`, …), and their types follow the procedure's output and errors.

## Call options

Pass what links read in `context`, kept apart from TanStack's own options: `trpc.post.byId.queryOptions({ input, context: { dedupe: false } })` ([Call options](../client/overview.md#call-options)).

## Cancellation

Queries and infinite queries pass TanStack's `signal` to the call, so TanStack [cancels](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) a fetch that nothing observes any more (the component unmounted, or the input changed) and the server's `signal` aborts too. `queryClient.cancelQueries()` does the same. A cancelled query goes back to its previous state rather than caching a late result. This was v11's `abortOnUnmount: true`.

## Structural sharing

A refetch that returns equal data keeps the old reference, `Date`s, `Map`s and `Set`s included, so it doesn't re-render. `queryOptions()` sets `structuralSharing` for that; it's exported for other queries.
