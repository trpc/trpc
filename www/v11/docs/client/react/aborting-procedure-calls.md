---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /client/react/aborting-procedure-calls
section: "Client Usage"
parent: "client/react"
order: 65
---

:::warning Deprecated
The classic React Query integration (`@trpc/react-query`) only gets bug fixes, and will be removed in the next major version of tRPC. New projects should use the [TanStack React Query integration](/docs/client/tanstack-react-query) (`@trpc/tanstack-react-query`). To move an existing project, follow the [migration guide](/docs/client/tanstack-react-query/migrating).
:::

By default, tRPC does not cancel requests via React Query. If you want to opt into this behavior, you can provide `abortOnUnmount` in your configuration.

For `useQuery`, when enabled, tRPC passes TanStack React Query's `AbortSignal` to the request. This also allows cancellation when a query becomes unused after its input changes, or when you call `queryClient.cancelQueries()` or `utils.someRoute.cancel()`. An unused cancelled query reverts to its previous state instead of caching a late result. See [TanStack Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

`useInfiniteQuery` does not use the `createTRPCReact` global option. Set `trpc: { abortOnUnmount: true }` on the query, or use the provider option. `useQueries` does not forward the signal, even when the global option is enabled, so an unused query may finish and cache its result. Do not rely on unmount cancellation for `useSuspenseQuery` or `useSuspenseInfiniteQuery` when an initial suspended render is removed before mounting.

For infinite queries, omit `cursor` and `direction` from input passed to `utils.someRoute.cancel()`: they are omitted from the infinite query key. `utils.someRoute.cancel()` can also cancel matching ordinary queries, whether input is supplied or not; without input it matches all inputs for that route. If the procedure requires a cursor, omitting it from the input to `cancel()` does not type-check. To target an infinite query by input, use `queryClient.cancelQueries({ queryKey: getQueryKey(trpc.someRoute, input, 'infinite') })`. By default, this matches partial input, including queries with additional input fields. For an exact match, use the full hook input and add `exact: true`, where the input type permits it.

Aborting an HTTP request does not automatically stop server-side work; the procedure must pass its signal to cancellable work. Cancellation also depends on the transport. With `wsLink`, cancelling a query locally does not stop a procedure already sent to the server. With batched HTTP links, the underlying request is aborted only when all operations in the batch are cancelled. For `httpBatchLink`, a query with `abortOnUnmount` disabled does not pass a signal, so cancelling it through React Query cannot abort the shared request.

:::note
@tanstack/react-query only supports aborting queries.
:::

```twoslash include router
import { initTRPC } from '@trpc/server';
import { z } from "zod";
const t = initTRPC.create();

const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({input}) => {
        return { id: input.id, title: 'Hello' };
      }),
  })
});
export type AppRouter = typeof appRouter;
```

### Globally

```ts twoslash title="client.ts"
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  post: t.router({
    byId: t.procedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
      return { id: input.id, title: 'Hello' };
    }),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils.ts
// ---cut---
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './server';

export const trpc = createTRPCReact<AppRouter>({
  abortOnUnmount: true,
});
```

### Per-request

You may also override this behavior at the query level.

```tsx twoslash title="pages/post/[id].tsx"
// @filename: server/router.ts
// @include: router
// @filename: utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCReact<AppRouter>();

// @filename: pages/posts.tsx
declare const useRouter: any;
// ---cut---
import { trpc } from '../utils/trpc';

function PostViewPage() {
  const { query } = useRouter();
  const postQuery = trpc.post.byId.useQuery(
    { id: query.id },
    { trpc: { abortOnUnmount: true } }
  );

  // ...
}
```
