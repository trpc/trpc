---
title: "Aborting Procedure Calls"
description: ""
section: "Client Usage"
parent: "client/react"
order: 38
---

By default, tRPC does not cancel requests via React Query. If you want to opt into this behaviour, you can provide `abortOnUnmount` in your configuration.

> [!NOTE]
> @tanstack/react-query only supports aborting queries.

### Globally

```ts title="client.ts"
import { createTRPCReact } from '@trpc/react-query';

export const trpc = createTRPCReact<AppRouter>({
  abortOnUnmount: true,
});

trpc.createClient({
  // ...
});
```

### Per-request

You may also override this behaviour at the query level.

```tsx title="pages/post/[id].tsx"
import { trpc } from '../utils/trpc';

function PostViewPage() {
  const { query } = useRouter();
  const postQuery = trpc.post.byId.useQuery(
    { id: query.id },
    { trpc: { abortOnUnmount: true } }
  );

  // ...
}
```
