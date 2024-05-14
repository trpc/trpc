```twoslash include server
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import z from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => {
      const { input } = opts;
      return `Hello ${input.name}` as const;
  }),
});

export type AppRouter = typeof appRouter;
```

```ts twoslash
// @target: esnext
// @include: server
// @filename: client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

// ---cut---
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});

const res = await trpc.greeting.query({ name: 'John' });
//    ^?
```
