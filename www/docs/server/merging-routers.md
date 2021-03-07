---
id: merging-routers
title: Merging Routers
sidebar_label: Merging Routers
slug: /merging-routers
---


Writing all API-code in your code in the same file is a bad idea. It's easy to merge routers with other routers. 

Thanks to TypeScript 4.1 template literal types we can also prefix the procedures without breaking type safety.


```ts
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
      }
    },
  })
  .query('list', {
    resolve() {
      // ..
      return []
    }
  });

const users = createRouter()
  .query('list', {
    resolve() {
      // ..
      return []
    }
  });


const appRouter = createRouter()
  .merge('users.', users) // prefix user procedures with "users."
  .merge('posts.', posts) // prefix poosts procedures with "posts."
  ;
```
