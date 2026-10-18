# `@trpc12/tanstack-vue-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds an app plugin (or `provideTrpc()`) for the client and its helpers, and `useSubscription`.

```sh
pnpm add @trpc12/trpc effect @trpc12/tanstack-vue-query @tanstack/vue-query
```

```ts
import { createTrpcContext } from '@trpc12/tanstack-vue-query';

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

- [Vue](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query/vue.md)
- [TanStack Query](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/tanstack-query.md)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://github.com/trpc/trpc/blob/v12/next/docs/packages.md#stability)).
