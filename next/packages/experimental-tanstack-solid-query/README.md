# `@trpc12/experimental-tanstack-solid-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds a context for the client and its helpers, and `useSubscription`.

The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-tanstack-solid-query @tanstack/solid-query
```

```tsx
import { createTrpcContext } from '@trpc12/experimental-tanstack-solid-query';

export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

function Post(props: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(() =>
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  return <h1>{post.data?.title}</h1>;
}
```

## Docs

- [Solid](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/solid.md)
- [TanStack Query](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query.md)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://github.com/trpc/trpc/blob/v12/next/docs/packages.md#stability)).
