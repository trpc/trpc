# `@trpc12/experimental-tanstack-angular-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds `provideTrpc()` and injectors for the client and its helpers, and `injectSubscription`.

The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-tanstack-angular-query @tanstack/angular-query-experimental
```

```ts
import { createTrpcContext } from '@trpc12/experimental-tanstack-angular-query';

export const { provideTrpc, injectTrpc } =
  createTrpcContext<typeof makeClient>();

bootstrapApplication(App, {
  providers: [
    provideTanStackQuery(new QueryClient()),
    provideTrpc(makeClient()),
  ],
});

// in a component
trpc = injectTrpc();
post = injectQuery(() =>
  this.trpc.post.byId.queryOptions({ input: { id: this.id() } }),
);
```

## Docs

- [Angular](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/angular.md)
- [TanStack Query](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query.md)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://github.com/trpc/trpc/blob/v12/next/docs/packages.md#stability)).
