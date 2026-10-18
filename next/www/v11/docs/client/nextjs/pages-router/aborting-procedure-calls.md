---
title: "Aborting Procedure Calls"
description: ""
section: "Client Usage"
parent: "client/nextjs/pages-router/setup"
order: 75
---

By default, tRPC does not cancel requests on unmount. If you want to opt into this behavior, you can provide `abortOnUnmount` in your configuration callback.

### Globally

```ts title="client.ts"
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './server/routers/_app';

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
      abortOnUnmount: true,
    };
  },
});
```

### Per-request

You may also override this behavior at the request level.

```tsx title="client.ts"
import { trpc } from './utils/trpc';
import { useRouter } from 'next/router';

function PostViewPage() {
  const id = useRouter().query.id as string;
  const postQuery = trpc.post.byId.useQuery({ id }, { trpc: { abortOnUnmount: true } });

  return null;
}
```
