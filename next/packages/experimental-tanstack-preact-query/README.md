# `@trpc12/experimental-tanstack-preact-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds a context for the client and its helpers, and `useSubscription`.

The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-tanstack-preact-query @tanstack/preact-query
```

```tsx
import { createTrpcContext } from '@trpc12/experimental-tanstack-preact-query';

export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

function Post(props: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  return <h1>{post.data?.title}</h1>;
}
```

## Docs

- [Preact](https://trpc.io/v12/docs/integrations/tanstack-query/preact)
- [TanStack Query](https://trpc.io/v12/docs/integrations/tanstack-query)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://trpc.io/v12/docs/packages#stability)).
