---
title: TanStack Query
description: Query, mutation and subscription options for TanStack Query, from one package and its React adapter.
section: Integrations
order: 1
v11: client/tanstack-react-query
---

`@trpc12/tanstack-query` turns a client into plain TanStack options objects (`queryOptions()`, `mutationOptions()`, keys and filters), so it works with every TanStack adapter. `@trpc12/tanstack-react-query` re-exports it and adds a way to provide the client to components, and a subscription primitive:

| Framework                          | Package                        | Provide the client            | Subscribe         |
| ---------------------------------- | ------------------------------ | ----------------------------- | ----------------- |
| [React](./tanstack-query/react.md) | `@trpc12/tanstack-react-query` | `<TrpcProvider>`, `useTrpc()` | `useSubscription` |

Install the core with your framework's package and TanStack's adapter, for React:

```package-install
@trpc12/trpc effect @trpc12/tanstack-react-query @tanstack/react-query
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
const router = t.router({
  post: {
    ...appRouter.post,
    list: t.procedure
      .input(z.object({ limit: z.number(), cursor: z.string().optional() }))
      .query((opts) => {
        const items = db.post.list().slice(0, opts.input.limit);
        return { items, nextCursor: items.at(-1)?.id };
      }),
  },
});
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
| query        | `queryOptions()`, `queryKey()`, `queryFilter()`, `infiniteOptions()`, `infiniteKey()`, `infiniteFilter()`                                                                      |
| mutation     | `mutationOptions()`, `mutationKey()`, `mutationFilter()`, and for a streamed output `streamedMutationOptions()` ([Streamed mutations](./tanstack-query/streamed-mutations.md)) |
| subscription | `subscriptionOptions()`, `liveOptions()`, `streamedOptions()` ([Subscriptions](./tanstack-query/subscriptions.md))                                                             |

`input: skipToken` disables a query or a subscription. The options take TanStack's own options next to `input` (`staleTime`, `select`, `onSuccess`, …), and their types follow the procedure's output and errors.

## Errors

The options carry the procedure's error type, so `useQuery` infers `error` as what the call fails with ([Errors](../client/errors.md)): the procedure's own errors, the [link codes](../client/errors.md#errors-from-the-links) the client's links declare (network failures, `NETWORK_ERROR`, over `httpLink` but not `localLink`), and the built-in ones that can always happen, aborts (`CLIENT_CLOSED_REQUEST`) and [timeouts](../client/errors.md#timeouts-and-cancels) (`TIMEOUT`) included. `useQueries`, `useInfiniteQuery`, `useMutation`, `useSuspenseQuery` and `useSubscription` infer it the same way. A procedure without `.input()` has no `BAD_REQUEST` of its own, so its `error` is only the built-in ones. `matchError()` makes you handle each:

```ts twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { client } from './client.ts';
const trpc = createTrpcQueryUtils({ client });
declare const id: string;
// ---cut-end---
import { matchError } from '@trpc12/trpc/client';

const post = useQuery(trpc.post.byId.queryOptions({ input: { id } }));
if (post.error) {
  const message = matchError(post.error, {
    NOT_FOUND: (err) => `No post ${err.data.id}`,
    BAD_REQUEST: () => 'Invalid id',
    NETWORK_ERROR: () => 'Offline, retrying soon',
    BAD_RESPONSE: () => 'Try again later',
    unexpected: (err) => err.message,
  });
}
```

TanStack carries the type as far as the options go:

- `QueryCache` and `MutationCache` callbacks see every query, so their error is TanStack's `DefaultError` (`Error`). Registering `Register.defaultError` changes those places only, not the hooks; narrow there with `isTrpcError(err)`.
- An error boundary gets what `useSuspenseQuery` (or `throwOnError`) throws as React's untyped error; narrow it with `isTrpcError` too. The hook's own `error` stays typed, for a refetch that fails after data arrived.
- What `select` throws becomes the query's `error`, outside the procedure's type. Keep `select` from throwing.

## Call options

Pass what links read in `context`, kept apart from TanStack's own options: `trpc.post.byId.queryOptions({ input, context: { dedupe: false } })` ([Call options](../client/overview.md#call-options)).

## Cancellation

Queries and infinite queries pass TanStack's `signal` to the call, so TanStack [cancels](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) a fetch that nothing observes any more (the component unmounted, or the input changed) and the server's `signal` aborts too. `queryClient.cancelQueries()` does the same. A cancelled query goes back to its previous state rather than caching a late result. This was v11's `abortOnUnmount: true`.

## Structural sharing

A refetch that returns equal data keeps the old reference, `Date`s, `Map`s and `Set`s included, so it doesn't re-render. `queryOptions()` sets `structuralSharing` for that; it's exported for other queries.

## Credits

The Vue, Solid, Svelte and Angular adapters were built to match [oRPC's TanStack Query integration](https://orpc.dev/docs/integrations/tanstack-query).
