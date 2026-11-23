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

Run the upgrade CLI from the folder with your `tsconfig.json`, on a git working tree without uncommitted changes:

```sh
npx @trpc/upgrade --yes
```

It runs two transforms over the files git tracks:

- **Setup:** `createTRPCReact` becomes `createTRPCContext`, `trpc.Provider` becomes `TRPCProvider`, and `trpc.createClient()` becomes `createTRPCClient()`. A `createTRPCNext` setup becomes the same file exporting `makeTRPCClient()`, `makeQueryClient()` and a `withTRPC()` for `_app`, which hydrates `trpcState` like before. See [Moving from `createTRPCNext`](/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext).
- **Hooks:** each hook becomes the TanStack Query hook with an options factory, such as `useQuery(trpc.a.queryOptions(input))`, and `trpc.useUtils()` becomes `useQueryClient()` with the matching filters and keys. `trpc.useQueries()`, `useSuspenseQueries()`, `utils.client` and `getQueryKey()` are covered too, as in the [table below](#equivalents-for-the-other-hooks-and-useutils). Each component or hook that needs it gets `const trpc = useTRPC()`.

Then it installs `@trpc/tanstack-react-query`, and uninstalls `@trpc/react-query` and `@trpc/next` unless a file still imports them, e.g. `createServerSideHelpers` from `@trpc/react-query/server`. Pass `--skipTanstackQuery` to leave your packages alone, or `--transforms provider` or `--transforms hooks` to run one transform. Without `--yes` or `--transforms`, it asks which to run.

What it can't move safely, such as `ssr: true` or a `trpc` used outside a component, gets a `TODO(@trpc/upgrade)` comment. Afterwards, format the changed files, typecheck, and search for those comments:

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
Once a component is on `queryOptions`, you can also start its query ahead of time. `const [{ greeting }] = await loadHandles(trpc, { greeting: ensureEntry(trpc.greeting, { name: 'Jerry' }) })` in a route loader or server component gives you a **handle** for it. Pass `greeting` to the component, which reads it with `useQuery(fromHandle(trpc, props.greeting))`. See [Prefetching with handles](/docs/client/tanstack-react-query/handles).
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
| `utils.a.fetch(input)`, `prefetch`, `ensureData` | `queryClient.query(trpc.a.queryOptions(input))`; add `.catch(noop)` for `prefetch`, or `staleTime: 'static'` in the options for `ensureData` |
| `utils.a.fetchInfinite(input)`, `prefetchInfinite` | `queryClient.infiniteQuery(trpc.a.infiniteQueryOptions(input))`; add `.catch(noop)` for `prefetchInfinite` |
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
