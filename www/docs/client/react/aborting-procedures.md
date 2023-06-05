---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /client/react/aborting-procedure-calls
---

By default, tRPC does not cancel requests via React Query. If you want to opt into this behaviour, you can provide `abortOnUnmount` in your configuration.

:::note
@tanstack/react-query only supports aborting queries.
:::

```twoslash include router
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
```

### Globally

```ts twoslash title="client.ts"
// @target: esnext
// ---cut---
// @filename: utils.ts
// @noErrors
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

```tsx twoslash title="pages/post/[id].tsx"
// @filename: server/router.ts
// @include: router
// @filename: utils/trpc.ts
// ---cut---
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
