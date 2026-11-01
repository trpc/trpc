---
title: "Aborting Procedure Calls"
description: ""
section: "Client Usage"
parent: "client/react"
order: 65
---

By default, tRPC does not cancel requests via React Query. If you want to opt into this behavior, you can provide `abortOnUnmount` in your configuration.

> [!NOTE]
> @tanstack/react-query only supports aborting queries.

### Globally

```ts twoslash title="client.ts"
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  post: t.router({
    byId: t.procedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
      return { id: input.id, title: 'Hello' };
    }),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils.ts
// ---cut---
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './server';

export const trpc = createTRPCReact<AppRouter>({
  abortOnUnmount: true,
});
```

### Per-request

You may also override this behavior at the query level.

```tsx twoslash title="pages/post/[id].tsx"
// @filename: server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from "zod";
const t = initTRPC.create();

const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({input}) => {
        return { id: input.id, title: 'Hello' };
      }),
  })
});
export type AppRouter = typeof appRouter;
// @filename: utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCReact<AppRouter>();

// @filename: pages/posts.tsx
declare const useRouter: any;
// ---cut---
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
