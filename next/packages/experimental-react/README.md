# `@trpc12/experimental-react`

Render-as-you-fetch for React's `use()`: loaders start queries, components read the promises, and caching, structural sharing, refetching and retries are links you opt into, one by one or with `standardLinks()`. The whole package is experimental, as its name says: every export might change or go away in any release. For a stable React integration, use [`@trpc12/tanstack-react-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-react-query).

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-react
```

```tsx
import {
  createReactClient,
  standardLinks,
  useQuery,
} from '@trpc12/experimental-react';

export const trpc = createReactClient({
  router: routerType<AppRouter>(),
  links: [...standardLinks(), httpLink({ url: '/trpc' })],
});

const post = trpc.post.byId.query({ id }); // in a loader
const data = use(useQuery(post)); // in the component
```

## Docs

- [React without TanStack Query](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/experimental-react.md)
- [React and Next.js](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/react.md)
