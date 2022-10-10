<!-- prettier-ignore -->
```ts twoslash
import { initTRPC } from '@trpc/server';
import z from 'zod';

// ---cut---
const t = initTRPC.create();

const router = t.router;
const publicProcedure = t.procedure;

const appRouter = router({
  greeting: publicProcedure
    .input(z.object({ name: z.string() }))
    .query((req) => {
      const { input } = req;
      //      ^?

      return {
        text: `Hello ${input.name}` as const,
      };
  }),
});

export type AppRouter = typeof appRouter;
```
