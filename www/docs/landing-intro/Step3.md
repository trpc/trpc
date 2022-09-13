```twoslash include server
// @module: esnext
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
        text: `Hello ${input.name}`,
      };
  }),
});

export type AppRouter = typeof appRouter;
```

```ts twoslash title='client.ts'
// @module: esnext
// @include: server
// @filename: client.ts
import { createTRPCProxyClient } from '@trpc/client';
import { AppRouter } from './server';

// ---cut---

async function main() {
  const client = createTRPCProxyClient<AppRouter>({
    url: 'http://localhost:3000',
  });

  const res = await client.greeting.query({ name: 'John' });
  //    ^?
}
```
