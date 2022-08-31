---
id: merging-routers
title: Merging Routers
sidebar_label: Merging Routers
slug: /merging-routers
---

Writing all API-code in your code in the same file is not a great idea. It's easy to merge routers with other routers.

Thanks to TypeScript 4.1 template literal types we can also prefix the procedures without breaking typesafety.

## Working example

- Code at [/examples/next-prisma-starter/src/server/routers/app.ts](https://github.com/trpc/trpc/blob/main/examples/next-prisma-starter/src/server/routers/_app.ts)
- All code for posts living in a separate router and namespaced with `post.`

## Example code

```ts title='server.ts'
import { trpc } from '@trpc/server';

export const t = trpc.create();

const postRouter = t.router({
  create: t.procedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) => {
      // ...
      return {
        id: 'xxxx',
        ...input,
      };
    }),
  list: t.procedure.query(() => {
    // ...
    return [];
  }),
});

const userRouter = t.router({
  list: t.procedure.query(() => {
    // ..
    return [];
  }),
});

const appRouter = t.router({
  user: userRouter, // put procedures under "user" namespace
  post: postRouter, // put procedures under "post" namespace
});
```
