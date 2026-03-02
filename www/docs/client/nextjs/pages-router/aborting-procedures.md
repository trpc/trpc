---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /client/nextjs/pages-router/aborting-procedure-calls
---

By default, tRPC does not cancel requests on unmount. If you want to opt into this behavior, you can provide `abortOnUnmount` in your configuration callback.

### Globally

```ts twoslash title="client.ts"
// @filename: server/routers/_app.ts

// @filename: client.ts
// ---cut---
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { initTRPC } from '@trpc/server';
import type { AppRouter } from './server/routers/_app';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

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

```tsx twoslash title="client.ts"
// @jsx: react-jsx
// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure.input(z.object({ id: z.string() })).query(() => ({ id: '1', title: 'Hello' })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/routers/_app';
export const trpc = createTRPCReact<AppRouter>();

// @filename: client.ts
// ---cut---
import { trpc } from './utils/trpc';
import { useRouter } from 'next/router';

function PostViewPage() {
  const id = useRouter().query.id as string;
  const postQuery = trpc.post.byId.useQuery({ id }, { trpc: { abortOnUnmount: true } });

  return null;
}
```
