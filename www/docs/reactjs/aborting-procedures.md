---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /reactjs/aborting-procedure-calls
---

By default, tRPC does not cancel requests on unmount. If you want to opt into this behaviour, you can provide `abortOnUnmount` in your configuration.

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

```ts twoslash title="utils/trpc.ts"
// @filename: server/router.ts
// @include: router
// @filename: utils/trpc.ts
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
// ---cut---
import { useState } from 'react';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCReact<AppRouter>();

function AppProvider() {
  const [client] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc' })],
      // FIXME: fix this in core
      // abortOnUnmount: true, // 👈
    }),
  );

  // ...
}
```

You may also override this behaviour at the request level.

```ts twoslash title="pages/post/[id].tsx"
// @filename: server/router.ts
// @include: router
// @filename: utils/trpc.ts
import { httpBatchLink } from '@trpc/client';
// ---cut---
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCReact<AppRouter>();
trpc.createClient({
  links: [httpBatchLink({ url: '/api/trpc' })],
  // FIXME: fix this in core
  // abortOnUnmount: true,
});
// @filename: pages/posts/[id].tsx
declare const useRouter: any;
// ---cut---
import { trpc } from '../../utils/trpc';

function PostViewPage() {
  const { query } = useRouter();
  const postQuery = trpc.post.byId.useQuery(
    { id: query.id },
    { trpc: { abortOnUnmount: true } }
  );

  // ...
}
```
