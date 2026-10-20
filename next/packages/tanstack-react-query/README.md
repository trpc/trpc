# `@trpc12/tanstack-react-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds a context for the client and its helpers, `useSubscription`, and server-component helpers in `/rsc`.

```sh
pnpm add @trpc12/trpc effect @trpc12/tanstack-react-query @tanstack/react-query
```

```tsx
import { createTrpcContext } from '@trpc12/tanstack-react-query';

const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

<QueryClientProvider client={queryClient}>
  <TrpcProvider client={client}>
    <App />
  </TrpcProvider>
</QueryClientProvider>;

function Post(props: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(
    trpc.post.byId.queryOptions({ input: { id: props.id } }),
  );
  return <h1>{post.data?.title}</h1>;
}
```

## Docs

- [React](https://trpc.io/v12/docs/integrations/tanstack-query/react)
- [React Server Components](https://trpc.io/v12/docs/integrations/rsc)
- [TanStack Query](https://trpc.io/v12/docs/integrations/tanstack-query)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://trpc.io/v12/docs/packages#stability)).
