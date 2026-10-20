# `@trpc12/experimental-tanstack-vue-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds an app plugin (or `provideTrpc()`) for the client and its helpers, and `useSubscription`.

The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-tanstack-vue-query @tanstack/vue-query
```

```ts
import { createTrpcContext } from '@trpc12/experimental-tanstack-vue-query';

export const { TrpcPlugin, useTrpc } = createTrpcContext<typeof makeClient>();
createApp(App)
  .use(VueQueryPlugin)
  .use(TrpcPlugin, { client: makeClient() })
  .mount('#app');

// in <script setup>
const trpc = useTrpc();
const post = useQuery(() =>
  trpc.post.byId.queryOptions({ input: { id: id.value } }),
);
```

## Docs

- [Vue](https://v12.trpc.io/v12/docs/integrations/tanstack-query/vue)
- [TanStack Query](https://v12.trpc.io/v12/docs/integrations/tanstack-query)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://v12.trpc.io/v12/docs/packages#stability)).
