# `@trpc12/tanstack-svelte-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds context helpers for the client and its helpers, and `createSubscription`.

```sh
pnpm add @trpc12/trpc @trpc12/tanstack-svelte-query @tanstack/svelte-query
```

```ts
// trpc.ts
import { createTrpcContext } from '@trpc12/tanstack-svelte-query';

export const [useTrpc, setTrpcContext] = createTrpcContext<typeof makeClient>();

// in a parent component: setTrpcContext(makeClient());
// in a component:
const trpc = useTrpc();
const post = createQuery(() => trpc.post.byId.queryOptions({ input: { id } }));
```

## Docs

- [Svelte](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/svelte.md)
- [TanStack Query](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query.md)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://github.com/trpc/trpc/blob/v12/next/docs/packages.md#stability)).
