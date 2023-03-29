# `@bevm0/trpc-svelte-query`

> A tRPC wrapper around @tanstack/svelte-query.

## Installation

```bash
# npm
npm install @bevm0/trpc-svelte-query @tanstack/svelte-query

# Yarn
yarn add @bevm0/trpc-svelte-query @tanstack/svelte-query

# pnpm
pnpm add @bevm0/trpc-svelte-query @tanstack/svelte-query
```

## Basic Example

### Create your [tRPC router](https://trpc.io/docs/router):
```ts
// src/lib/trpc/router.ts
import delay from 'delay';
import { initTRPC } from '@trpc/server';
import type { Context } from '$lib/trpc/context';

const t = initTRPC.context<Context>().create();
export const { router, procedure } = t

export const appRouter = router({
  greeting: procedure.query(async () => {
    await delay(500); // 👈 simulate an expensive operation
    return `Hello tRPC v10 @ ${new Date().toLocaleTimeString()}`;
  })
});

export type AppRouter = typeof appRouter;
```

### 2. Create the tRPC + svelte-query proxy client.

```ts
// src/lib/trpc.ts
import { createTRPCSvelte } from '@bevm0/trpc-svelte-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '$lib/trpc/router';

export const trpc = createTRPCSvelte<AppRouter>({
  links: [
    httpBatchLink({ url: 'http://localhost:5173/trpc' }),
  ],
});
```

### 3. Add the provider to the root layout to connect to your API.

```html
<!-- src/routes/+layout.svelte -->
<script>
  import { QueryClientProvider } from '@tanstack/react-query';
  import { trpc } from '$lib/trpc'
</script>

<QueryClientProvider client={trpc.queryClient}>
  <slot />
</QueryClientProvider>
```

### 4. Now in any component, you can query your API using the trpc proxy exported from the trpc file.

```html
<!-- src/routes/+page.svelte -->
<script>
  import { trpc } from '$lib/trpc';
  const query = trpc.greeting.createQuery()
</script>

<p>Your greeting is: {$query.data}</p>
```

## SvelteKit Prefetch Example

1-4. Follow the same steps as the basic example.

### 5. Directly fetch the query using `utils` in a `+layout.ts` or `+page.ts` above the desired route.

```ts
// src/routes/+page.ts

import { trpc } from '$lib/trpc'
import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  return {
    // `fetch`, `prefetch`, `fetchInfinite`, `prefetchInfinite` 
    // will do the request and cache it in the queryClient during the load function, before page load
    count: trpc.utils.count.fetch()
  }
}
```

Now the data is fetched and cached **prior** to the page loading.
- The data will be "undefined" at first if the prefetch step isn't done
- Another fetch may occur on mount if you don't explictly tune the QueryClient settings,
  e.g. by turning "refetchOnMount" to false.
  - The main difference from before is that this fetch request is done to refresh stale data,
    whereas it was trying to get data for the first time when not prefetching.
- `prefetch` and `prefetchInfinite` fetch and cache the results, but **don't return anything**
- `fetch` and `fetchInfinite` fetch, cache, and return the results.
- It's possible to simply fetch, cache, and use the value in a page without it being tied to any svelte-query construct.


## Root Properties
- `client`: a `TRPCProxyClient` that can be used to do a direct tRPC request.
- `queryClient`: the `QueryClient` used by the hooks to cache results.
- `utils`: a "shadow" of the proxy that provides greater control over the clients.
