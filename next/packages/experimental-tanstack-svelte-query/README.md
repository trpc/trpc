# `@trpc12/experimental-tanstack-svelte-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds context helpers for the client and its helpers, and `createSubscription`.

The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-tanstack-svelte-query @tanstack/svelte-query
```

```ts
// trpc.ts
import { createTrpcContext } from '@trpc12/experimental-tanstack-svelte-query';

export const [useTrpc, setTrpcContext] = createTrpcContext<typeof makeClient>();

// in a parent component: setTrpcContext(makeClient());
// in a component:
const trpc = useTrpc();
const post = createQuery(() => trpc.post.byId.queryOptions({ input: { id } }));
```

## Docs

- [Svelte](https://trpc.io/v12/docs/integrations/tanstack-query/svelte)
- [TanStack Query](https://trpc.io/v12/docs/integrations/tanstack-query)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://trpc.io/v12/docs/packages#stability)).
