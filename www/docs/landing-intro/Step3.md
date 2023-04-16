```twoslash include server
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import z from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query((req) => {
      const { input } = req;
      return {
        text: `Hello ${input.name}` as const,
      };
  }),
});

export type AppRouter = typeof appRouter;
```

```ts twoslash
// @target: esnext
// @include: server
// @filename: client.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

// ---cut---
const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});

const res = await trpc.greeting.query({ name: 'John' });
//    ^?
```
