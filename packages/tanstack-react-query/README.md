<p align="center">
  <a href="https://trpc.io/"><img src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg" alt="tRPC" height="75"/></a>
</p>

<h3 align="center">tRPC</h3>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
</p>

# `@trpc/tanstack-react-query`

> A tRPC wrapper around @tanstack/react-query.

> [!WARNING]
>
> 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧
> This package is currently in beta as we stabilize the API. We might do breaking changes without respecting semver.

## Documentation

Full documentation is coming as the package API stabilizes. The following shows a quickstart.

1. Initialize the React context:

```ts
// utils/trpc.tsx
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '~/server/routers/_app';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
```

2. Initialize the tRPC client and create a provider stack with React Query:

```tsx
// utils.trpc.tsx
export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [unstable_httpBatchStreamLink({ url: BASE_URL + '/api/trpc' })],
    }),
  );

  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {props.children}
        <ReactQueryDevtools />
      </QueryClientProvider>
    </TRPCProvider>
  );
}
```

3. Wrap your app with the provider stack:

```tsx
// app/root.tsx
function App() {
  return (
    <TRPCReactProvider>
      <Outlet />
    </TRPCReactProvider>
  );
}
```

4. Use the generated `useTRPC` hook to get your typesafe queryOptions proxy. Notice that we import the hooks directly from `@tanstack/react-query`.

```tsx
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useTRPC } from '~/utils/trpc';

export function Post() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: latestPost } = useSuspenseQuery(
    trpc.getLatestPost.queryOptions(),
  );

  const { mutate: createPost } = useMutation(
    trpc.createPost.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.getLatestPost.queryFilter());
      },
    }),
  );

  return <>...</>;
}
```

## Installation

> Requires `@tanstack/react-query` v5.62.8 or higher

```bash
# npm
npm install @trpc/tanstack-react-query@next @tanstack/react-query

# Yarn
yarn add @trpc/tanstack-react-query@next @tanstack/react-query

# pnpm
pnpm add @trpc/tanstack-react-query@next @tanstack/react-query

# Bun
bun add @trpc/tanstack-react-query@next @tanstack/react-query
```
