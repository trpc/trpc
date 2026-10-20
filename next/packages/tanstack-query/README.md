# `@trpc12/tanstack-query`

Turns a tRPC client into plain TanStack Query options (`queryOptions()`, `infiniteOptions()`, `mutationOptions()`, subscription options), keys and filters, so it works with every TanStack adapter. Apps usually install the package for their framework, which re-exports this one: `@trpc12/tanstack-react-query`, `-preact-`, `-vue-`, `-solid-`, `-svelte-`, `-angular-` or `-lit-query`.

```sh
pnpm add @trpc12/trpc effect @trpc12/tanstack-query @tanstack/query-core
```

```ts
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';

export const trpc = createTrpcQueryUtils({ client });

useQuery(trpc.post.byId.queryOptions({ input: { id } }));
useMutation(trpc.post.create.mutationOptions());
await queryClient.invalidateQueries(trpc.post.pathFilter());
```

## Docs

- [TanStack Query](https://v12.trpc.io/v12/docs/integrations/tanstack-query)
- [Query keys and filters](https://v12.trpc.io/v12/docs/integrations/tanstack-query/keys)
- [Subscriptions](https://v12.trpc.io/v12/docs/integrations/tanstack-query/subscriptions)
- [Streamed mutations](https://v12.trpc.io/v12/docs/integrations/tanstack-query/streamed-mutations)
- [Hydration and offline mutations](https://v12.trpc.io/v12/docs/integrations/tanstack-query/hydration)
- [TanStack DB](https://v12.trpc.io/v12/docs/integrations/tanstack-query/tanstack-db)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://v12.trpc.io/v12/docs/packages#stability)).
