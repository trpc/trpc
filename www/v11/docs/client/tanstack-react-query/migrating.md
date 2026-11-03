---
id: migrating
title: Migrating from the classic React Client
sidebar_label: Migrating
description: Migrating from the classic React Client
slug: /client/tanstack-react-query/migrating
section: "Client Usage"
parent: "client/tanstack-react-query"
order: 50
skill:
  name: react-query-classic-migration
  package: "@trpc/tanstack-react-query"
  type: lifecycle
  requires:
    - react-query-setup
  description: "Migrate from @trpc/react-query (classic, createTRPCReact) to
    @trpc/tanstack-react-query (createTRPCContext). Run the npx @trpc/upgrade
    codemod, or migrate gradually with both providers sharing one QueryClient.
    Map trpc.x.useQuery/useMutation/useInfiniteQuery/useSuspenseQuery/
    useSubscription/useQueries to TanStack hooks with queryOptions/
    mutationOptions factories, trpc.useUtils() to useQueryClient() with
    queryFilter/pathFilter/queryKey, and abortOnUnmount/overrides to their
    replacements."
---

There are a few approaches to migrate over, and this library is a significant departure from the classic client, so we're not expecting anybody to do it in one shot. But you will probably want to try a combination of...

## Codemod migration

:::info
The codemod is a work in progress and we're looking for help to make it better. If you're interested in contributing to the codemod, please see [Julius' comment here](https://github.com/trpc/trpc/pull/6262#issuecomment-2651959435).
:::

We're working on a codemod to help you migrate your existing codebase over to the new client. This is already available to try but we need your feedback and contributions to improve it. Codemods are very tricky to get right so we're looking for your help to make it as effective as possible.

Run our upgrade CLI:

```sh
npx @trpc/upgrade
```

When prompted, select the transforms `Migrate Hooks to xxxOptions API` and `Migrate context provider setup`.

The CLI refuses to run on a git working tree with uncommitted changes, unless you pass `--force`. After the transforms it installs `@trpc/tanstack-react-query` and **uninstalls `@trpc/react-query`**, so pass `--skipTanstackQuery` if you want to keep both while you migrate gradually. It doesn't cover every pattern (`useQueries`, for example), so typecheck afterwards and migrate whatever is left by hand, using the mappings below.

```sh
npx tsc --noEmit
```

## Gradual migration

The new and classic clients are compatible with each other and [can live together in the same application](https://github.com/juliusmarminge/trpc-interop/blob/main/src/client.tsx).
This means you can start migrating by using the new client in new parts of your application, and gradually migrate over existing usage as you see fit. Most importantly,
Query Keys are identical, which means you can use the new client and classic client together and still rely on TanStack Query's caching.

### Migrating the provider

Install the new package, and create its hooks next to the classic ones

```package-install
@trpc/tanstack-react-query
```

```ts twoslash title="utils/trpc.ts"
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
// ---cut---
import { createTRPCReact } from '@trpc/react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

// Classic, until nothing uses it
export const trpc = createTRPCReact<AppRouter>();

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();
```

The classic `trpc.Provider` takes the tRPC client as `client`; `TRPCProvider` takes it as `trpcClient`. While both are mounted, give them the same `QueryClient` and tRPC client, so they share one cache. `trpc.createClient()` becomes `createTRPCClient<AppRouter>()` from `@trpc/client`.

```tsx twoslash title="components/App.tsx"
// @jsx: react-jsx
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';
export const trpc = createTRPCReact<AppRouter>();
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: components/App.tsx
// ---cut---
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import type { AppRouter } from '../server/router';
import { trpc, TRPCProvider } from '../utils/trpc';

export function App(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: '/api/trpc' })],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {/* Remove once nothing uses the classic hooks */}
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          {props.children}
        </trpc.Provider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### Migrating Queries

A classic query would look like this

```tsx twoslash
// @filename: trpc.ts
import type { UseQueryResult } from '@tanstack/react-query';
declare const trpc: {
  greeting: {
    useQuery: (input: { name: string }) => UseQueryResult<`Hello ${string}`>;
  };
};
export { trpc };

// @filename: component.tsx
// ---cut---
import { trpc } from './trpc';

function Users() {
  const greetingQuery = trpc.greeting.useQuery({ name: 'Jerry' });

  // greetingQuery.data === 'Hello Jerry'
}
```

and changes to

```tsx twoslash
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  greeting: t.procedure.input(z.object({ name: z.string() })).query(({ input }) => `Hello ${input.name}` as const),
});
export type AppRouter = typeof appRouter;

// @filename: trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './server/router';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: component.tsx
// ---cut---
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

function Users() {
  const trpc = useTRPC();

  const greetingQuery = useQuery(trpc.greeting.queryOptions({ name: 'Jerry' }));

  // greetingQuery.data === 'Hello Jerry'
}
```

:::tip
Once a component is on `queryOptions`, you can also start its query ahead of time. `await trpc.greeting.unstable_$ensure({ name: 'Jerry' })` in a route loader or server component returns a **handle**, and the component reads it with `useQuery(trpc.unstable_$fromHandle(props.greeting))`. See [Prefetching with handles](/docs/client/tanstack-react-query/handles).
:::

### Migrating Invalidations and other QueryClient usages

A classic invalidation pattern would look like this

```tsx twoslash
// @filename: trpc.ts
declare const trpc: {
  useUtils: () => {
    greeting: {
      invalidate: (input: { name: string }) => Promise<void>;
    };
  };
};
export { trpc };

// @filename: component.tsx
// ---cut---
import { trpc } from './trpc';

function Users() {
  const utils = trpc.useUtils();

  async function invalidateGreeting() {
    await utils.greeting.invalidate({ name: 'Jerry' });
  }
}
```

and changes to

```tsx twoslash
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  greeting: t.procedure.input(z.object({ name: z.string() })).query(({ input }) => `Hello ${input.name}` as const),
});
export type AppRouter = typeof appRouter;

// @filename: trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './server/router';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: component.tsx
// ---cut---
import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from './trpc';

function Users() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  async function invalidateGreeting() {
    await queryClient.invalidateQueries(
      trpc.greeting.queryFilter({ name: 'Jerry' }),
    );
  }
}
```

This is the same for any QueryClient usage, instead of using tRPC's `useUtils` you can now follow the TanStack documentation directly

### Migrating Mutations

A classic mutation might look like this

```tsx twoslash
// @filename: trpc.ts
import type { UseMutationResult } from '@tanstack/react-query';
declare const trpc: {
  createUser: {
    useMutation: () => UseMutationResult<string, unknown, { name: string }>;
  };
};
export { trpc };

// @filename: component.tsx
// ---cut---
import { trpc } from './trpc';

function Users() {
  const createUserMutation = trpc.createUser.useMutation();

  createUserMutation.mutate({ name: 'Jerry' });
}
```

and changes to

```tsx twoslash
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  createUser: t.procedure.input(z.object({ name: z.string() })).mutation(() => 'created'),
});
export type AppRouter = typeof appRouter;

// @filename: trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './server/router';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: component.tsx
// ---cut---
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from './trpc';

function Users() {
  const trpc = useTRPC();

  const createUserMutation = useMutation(trpc.createUser.mutationOptions());

  createUserMutation.mutate({ name: 'Jerry' });
}
```

### Equivalents for the other hooks and `useUtils`

Every hook takes the `trpc` from `useTRPC()`, and `utils` becomes `const queryClient = useQueryClient()`. Here `a` is a procedure and `r` a router.

| Classic                                       | New                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `trpc.a.useSuspenseQuery(input)`              | `useSuspenseQuery(trpc.a.queryOptions(input))`, which returns the query, not a `[data, query]` pair |
| `trpc.a.useInfiniteQuery(input, opts)`        | `useInfiniteQuery(trpc.a.infiniteQueryOptions(input, opts))`                                        |
| `trpc.a.useSubscription(input, opts)`         | `useSubscription(trpc.a.subscriptionOptions(input, opts))`, imported from `@trpc/tanstack-react-query` |
| `trpc.useQueries((t) => [t.a(input)])`        | `useQueries({ queries: [trpc.a.queryOptions(input)] })`                                             |
| `utils.a.invalidate(input)`                   | `queryClient.invalidateQueries(trpc.a.queryFilter(input))`                                          |
| `utils.r.invalidate()` / `utils.invalidate()` | `queryClient.invalidateQueries(trpc.r.pathFilter())` / `(trpc.pathFilter())`                        |
| `utils.a.refetch()`, `reset()`, `cancel()`    | `refetchQueries`, `resetQueries`, `cancelQueries` with the same filters                             |
| `utils.a.fetch(input)`, `prefetch`, `ensureData` | `queryClient.fetchQuery(trpc.a.queryOptions(input))`, `prefetchQuery`, `ensureQueryData`         |
| `utils.a.fetchInfinite(input)`, `prefetchInfinite` | `fetchInfiniteQuery(trpc.a.infiniteQueryOptions(input))`, `prefetchInfiniteQuery`             |
| `utils.a.getData(input)`, `setData(input, updater)` | `queryClient.getQueryData(trpc.a.queryKey(input))`, `setQueryData(trpc.a.queryKey(input), updater)` |
| `utils.a.getInfiniteData`, `setInfiniteData`  | The same, with `trpc.a.infiniteQueryKey(input)`                                                     |
| `utils.client`                                | `useTRPCClient()`                                                                                   |

### Migrating `abortOnUnmount`

The classic integration takes `abortOnUnmount` when you create the client, which sets the default for every query — an individual query can still override it through its own `trpc` option

```ts twoslash title="trpc.ts"
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  greeting: t.procedure.input(z.object({ name: z.string() })).query(({ input }) => `Hello ${input.name}` as const),
});
export type AppRouter = typeof appRouter;

// @filename: trpc.ts
// ---cut---
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './server/router';

export const trpc = createTRPCReact<AppRouter>({
  abortOnUnmount: true,
});
```

`createTRPCContext()` takes no options, so there is no global equivalent. Set `abortOnUnmount` per query instead, in the same `trpc` option the classic integration uses per request

```tsx twoslash
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  greeting: t.procedure.input(z.object({ name: z.string() })).query(({ input }) => `Hello ${input.name}` as const),
});
export type AppRouter = typeof appRouter;

// @filename: trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './server/router';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: component.tsx
// ---cut---
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

function Users() {
  const trpc = useTRPC();

  const greetingQuery = useQuery(
    trpc.greeting.queryOptions({ name: 'Jerry' }, { trpc: { abortOnUnmount: true } }),
  );
}
```

:::note
@tanstack/react-query only supports aborting queries, so this applies to `queryOptions` and `infiniteQueryOptions`.
:::

### Migrating `overrides`

`createTRPCContext()` doesn't take the classic `overrides` either. To run something after every mutation, such as [invalidating the whole cache](/docs/client/react/useUtils#invalidate-full-cache-on-every-mutation), use TanStack's own `MutationCache` callbacks

```ts twoslash title="utils/query-client.ts"
import { MutationCache, QueryClient } from '@tanstack/react-query';

export const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => queryClient.invalidateQueries(),
  }),
});
```

## Common mistakes

- **Destructuring `useSuspenseQuery`.** The classic hook returns `[data, query]`; TanStack's returns the query, so `const [data] = ...` becomes `const { data } = ...`.
- **Mounting a second `QueryClient`.** While both clients are in use, a separate `QueryClient` for each provider splits the cache, so an invalidation from one side doesn't refresh queries on the other. Share one.
- **Losing `@trpc/react-query` mid-migration.** The upgrade CLI uninstalls it unless you pass `--skipTanstackQuery`.
- **Trusting the codemod blindly.** It rewrites the common patterns only. Typecheck after it runs, and check custom wrappers around tRPC hooks by hand.
