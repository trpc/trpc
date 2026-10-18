# `@trpc12/tanstack-query`

Turns a tRPC client into plain TanStack Query options (`queryOptions()`, `infiniteOptions()`, `mutationOptions()`, subscription options), keys and filters, so it works with every TanStack adapter. Apps usually install the package for their framework, which re-exports this one: `@trpc12/tanstack-react-query`, `-preact-`, `-vue-`, `-solid-`, `-svelte-`, `-angular-` or `-lit-query`.

```sh
pnpm add @trpc12/trpc @trpc12/tanstack-query @tanstack/query-core
```

```ts
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';

export const trpc = createTrpcQueryUtils({ client });

useQuery(trpc.post.byId.queryOptions({ input: { id } }));
useMutation(trpc.post.create.mutationOptions());
await queryClient.invalidateQueries(trpc.post.pathFilter());
```

## Docs

- [TanStack Query](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query.md)
- [Query keys and filters](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/keys.md)
- [Subscriptions](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/subscriptions.md)
- [Streamed mutations](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/streamed-mutations.md)
- [Hydration and offline mutations](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/hydration.md)
- [TanStack DB](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/tanstack-db.md)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://github.com/trpc/trpc/blob/v12/next/docs/packages.md#stability)).
