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
const createRouter = () => {
  return trpc.router<Context>();
};

const posts = createRouter()
  .mutation('create', {
    input: z.object({
      title: z.string(),
    }),
    resolve: ({ input }) => {
      // ..
      return {
        id: 'xxxx',
        ...input,
      };
    },
  })
  .query('list', {
    resolve() {
      // ..
      return [];
    },
  });

const users = createRouter().query('list', {
  resolve() {
    // ..
    return [];
  },
});

const appRouter = createRouter()
  .merge('user.', users) // prefix user procedures with "user."
  .merge('post.', posts); // prefix post procedures with "post."
```
