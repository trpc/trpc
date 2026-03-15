---
name: skills/react-query-classic-migration
description: >
  Migrate from @trpc/react-query (classic) to @trpc/tanstack-react-query.
  Run npx @trpc/upgrade CLI for automated codemod. Manually migrate
  remaining patterns: hook-based to options-factory, utils.invalidate
  to queryClient.invalidateQueries with queryFilter, provider changes.
type: lifecycle
library: trpc
library_version: "11.13.4"
requires:
  - react-query-setup
sources:
  - www/docs/client/tanstack-react-query/migrating.mdx
---

This skill builds on [react-query-setup]. Read it first for foundational concepts.

# tRPC -- Classic React Query Migration

## Overview

This skill covers migrating from `@trpc/react-query` (the classic tRPC React hooks) to `@trpc/tanstack-react-query` (the new options-factory client). The two packages can coexist in the same application, so you can migrate incrementally.

## Step 1: Run the upgrade CLI

```sh
npx @trpc/upgrade
```

When prompted, select:
- `Migrate Hooks to xxxOptions API`
- `Migrate context provider setup`

The codemod handles common patterns but is a work in progress. Always typecheck after running it.

## Step 2: Install the new package

```sh
npm install @trpc/tanstack-react-query
```

You can keep `@trpc/react-query` installed during the migration period.

## Step 3: Set up the new provider

Replace the classic `createTRPCReact` setup with `createTRPCContext`:

```ts title="utils/trpc.ts"
// BEFORE (classic)
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/router';
export const trpc = createTRPCReact<AppRouter>();

// AFTER (new)
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
```

Update the provider in your app root:

```tsx title="App.tsx"
// BEFORE (classic)
import { trpc } from '../utils/trpc';
// trpc.Provider wrapping with queryClient and client props

// AFTER (new)
import { QueryClientProvider } from '@tanstack/react-query';
import { TRPCProvider } from '../utils/trpc';

<QueryClientProvider client={queryClient}>
  <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
    {children}
  </TRPCProvider>
</QueryClientProvider>
```

## Migration Patterns

### Queries

```tsx
// BEFORE (classic)
import { trpc } from './trpc';

function Users() {
  const greeting = trpc.greeting.useQuery({ name: 'Jerry' });
}

// AFTER (new)
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

function Users() {
  const trpc = useTRPC();
  const greeting = useQuery(trpc.greeting.queryOptions({ name: 'Jerry' }));
}
```

### Mutations

```tsx
// BEFORE (classic)
import { trpc } from './trpc';

function Users() {
  const createUser = trpc.createUser.useMutation();
  createUser.mutate({ name: 'Jerry' });
}

// AFTER (new)
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from './trpc';

function Users() {
  const trpc = useTRPC();
  const createUser = useMutation(trpc.createUser.mutationOptions());
  createUser.mutate({ name: 'Jerry' });
}
```

### Query invalidation

```tsx
// BEFORE (classic)
import { trpc } from './trpc';

function Users() {
  const utils = trpc.useUtils();
  async function invalidateGreeting() {
    await utils.greeting.invalidate({ name: 'Jerry' });
  }
}

// AFTER (new)
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

### Other QueryClient operations

Any classic `trpc.useUtils()` usage maps to standard TanStack Query `useQueryClient()` calls:

| Classic (`utils.xxx`)          | New (queryClient + trpc)                                    |
| ------------------------------ | ----------------------------------------------------------- |
| `utils.post.invalidate()`     | `queryClient.invalidateQueries(trpc.post.queryFilter())`    |
| `utils.post.refetch()`        | `queryClient.refetchQueries(trpc.post.queryFilter())`       |
| `utils.post.getData(input)`   | `queryClient.getQueryData(trpc.post.byId.queryKey(input))` |
| `utils.post.setData(input,d)` | `queryClient.setQueryData(trpc.post.byId.queryKey(input),d)`|

## Step 4: Typecheck and fix

After migrating all files (or a batch of files), run TypeScript to catch remaining issues:

```sh
npx tsc --noEmit
```

Common type errors after migration:
- Missing `useTRPC()` call (the new pattern requires calling the hook inside the component)
- Incorrect options shape (the new `queryOptions`/`mutationOptions` take input as the first arg, TanStack options as the second)
- `useUtils()` references that need to become `useQueryClient()` + `useTRPC()` pairs

## Step 5: Remove classic package

Once all files are migrated and TypeScript passes:

```sh
npm uninstall @trpc/react-query
```

## Common Mistakes

### Assuming the codemod handles everything

`npx @trpc/upgrade` is a work-in-progress codemod. It handles common patterns but may miss complex cases like dynamic query keys, conditional hooks, or custom wrappers around tRPC hooks. Always run `tsc --noEmit` after the codemod completes and fix remaining errors manually.

### Mixing classic and new hooks in the same component

While the classic and new packages can coexist in the same app, mixing their hooks in the same component creates confusing dual-provider requirements and makes the code harder to reason about. Migrate one component at a time, converting all hooks in that component from classic to new in a single pass.

## See Also

- [react-query-setup] -- full setup guide for the new @trpc/tanstack-react-query package
- [nextjs-app-router] -- if migrating a Next.js app to App Router at the same time
