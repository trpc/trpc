<!-- prettier-ignore -->
```ts twoslash
import { initTRPC } from '@trpc/server';
import z from 'zod';

// ---cut---

const t = initTRPC.create();

const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query((req) => {
      const { input } = req;
      //      ^?
      return {
        text: `Hello ${input.name}`,
      };
  }),
});

export type AppRouter = typeof appRouter;
```
