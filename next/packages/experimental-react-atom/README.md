# `@trpc12/experimental-react-atom`

Queries, mutations and subscriptions as Effect atoms (`effect/reactivity`), read in React with `@effect/atom-react`, modeled on Effect's `AtomRpc`. The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-react-atom @effect/atom-react
```

```tsx
import { useAtomSuspense } from '@effect/atom-react';
import { createAtomClient } from '@trpc12/experimental-react-atom';

export const trpc = createAtomClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc', serializer: createSerializer() })],
});

const post = useAtomSuspense(trpc.post.byId.query({ id })).value;
```

## Docs

- [React atoms](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/experimental-react-atom.md)
- [React and Next.js](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/react.md)
