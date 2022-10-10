---
id: query-invalidation
title: Query Invalidation
slug: /query-invalidation
---

:::note
`@trpc/react`'s invalidate is a thin wrapper around
@tanstack/react-query's `queryClient.invalidateQueries()`. For in-depth
information about options and usage patterns, refer to their docs on [query
invalidation](https://tanstack.com/query/v4/docs/guides/query-invalidation).
:::

## Invalidating a single query

You can invalidate a query relating to a single procedure and even filter based
on the input passed to it to prevent unnecessary calls to the back end.  

### Example code

```tsx
import { trpc } from '../utils/trpc';

function MyComponent() {
  const utils = trpc.useContext();

  const mutation = trpc.post.edit.useMutation({
    onSuccess(input) {
      utils.post.all.invalidate();
      utils.post.byId.invalidate({ id: input.id }); // Will not invalidate queries for other id's 👍
    },
  });

  // [...]
}
```

## Invalidating across whole routers

It is also possible to invalidate queries across an entire router rather then
just one query.

When doing this it is still possible to filter queries that will be invalidated
by their input values. tRPC will even infer the types of these possible input values
for you; across all queries that could be affected!

### Example code

<details><summary>Backend code</summary>

```tsx title='server/routers/_app.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  // sub Post router
  post: t.router({
    all: t.procedure.query(() => {
      return {
        posts: [
          { id: 1, title: 'everlong' },
          { id: 2, title: 'After Dark' },
        ],
      };
    }),
    byId: t.procedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .query(({ input }) => {
        return {
          post: { id: input?.id, title: 'Look me up!' },
        };
      }),
    edit: t.procedure
      .input(z.object({ id: z.number(), title: z.string() }))
      .mutation(({ input }) => {
        return { post: { id: input.id, title: input.title } };
      }),
  }),
  // separate user router
  user: t.router({
    all: t.procedure.query(() => {
      return { users: [{ name: 'Dave Grohl' }, { name: 'Haruki Murakami' }] };
    }),
  }),
});
```

</details>

```tsx
import { trpc } from '../utils/trpc';

function MyComponent() {
  const utils = trpc.useContext();

  const invalidateAllQueriesAcrossAllRouters = () => { // 1️⃣
    // All queries on all routers will be invalidated 🔥
    utils.invalidate() 
  }

  const invalidateAllPostQueries = () => { // 2️⃣
     // All post queries will be invalidated 📭
    utils.post.invalidate() 
  }

  const invalidateAllPostQueriesWithMatchingInputs = () => { // 3️⃣
    // All queries in the post router with input {id:1} invalidated 📭
    utils.post.invalidate({id:1}) 
  }

  // Example queries
  trpc.user.all.useQuery() // Would only be validated by 1️⃣ only. 
  trpc.post.all.useQuery() // Would be invalidated by 1️⃣ & 2️⃣
  trpc.post.byId.useQuery({ id:1 }) // Would be invalidated by 1️⃣, 2️⃣ and 3️⃣
  trpc.post.byId.useQuery({ id:2 }) // would be invalidated by 1️⃣ and 2️⃣ but NOT 3️⃣!


  // [...]
}

```


## Invalidate full cache on every mutation

Keeping track of exactly what a queries a mutation should invalidate is hard, therefore, it can be a pragmatic solution to invalidate the *full cache* as a side-effect on any mutation. Since we have request batching, this invalidation will simply refetch all queries on the page you're looking at in one single request.


:::caution
We have marked this API as `unstable_` as the exact API might change without a major version bump on tRPC, keep an eye on the release notes if you want to use this.
:::

We have added a feature to help with this:


```ts 
export const trpc = createTRPCReact<AppRouter, SSRContext>({
  unstable_overrides: {
    useMutation: {
      /**
       * This function is called whenever a `.useMutation` succeeds
       **/
      async onSuccess(opts) {
        /**
         * @note that order here matters:
         * The order here allows route changes in `onSuccess` without 
         * having a flash of content change whilst redirecting.
         **/

        // Calls the `onSuccess` defined in the `useQuery()`-options:
        await opts.originalFn(); 

        // Invalidate all queries in the react-query cache:
        await opts.queryClient.invalidateQueries(); 
      },
    },
  },
});
```

An example usage of this pattern would look something like this. The following would trigger all queries to invalidate upon a successful mutation:

```ts
export const trpc = createTRPCReact({
  overrides: {
    useMutation: {
      async onSuccess(opts) {
        // the onSuccess function on a procedure-level
        await opts.originalFn();
        // invalidate all queries when mutations are successful
        await opts.queryClient.invalidateQueries();
      },
    },
  },
});
```

