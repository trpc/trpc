---
slug: introducing-trpc
title: Introducing tRPC
author: Alex / KATT 🐱
author_title: Creator of tRPC
author_url: https://twitter.com/alexdotjs
author_image_url: https://avatars1.githubusercontent.com/u/459267?s=460&v=4
tags: [trpc]
---

I'm Alex, or "KATT" on GitHub, and I want to tell you about a library called [tRPC](https://trpc.io). I've not published any articles about, so I'm just writing this intro to get the ball rolling (but we have already somehow reached >530 🌟 on GitHub). Expect articles & video intros to come! If you want to stay up-to-date or want to ask questions, you can follow me on Twitter at [@alexdotjs](https://twitter.com/alexdotjs).

In short - tRPC gives you end-to-end type safety from your (node-)server to your client, _without even declaring types_. All you do on the backend is that you return data in a function and on the frontend you use said data based on the endpoint name.

**This is how it can look like when doing a tRPC endpoint & client call:**
![Alt Text](https://assets.trpc.io/www/v9/trpcgif.gif)

I have made a library for React (`@trpc/react`) that sits on top of the great react-query, but the client library (`@trpc/client`) works without React (if you want to build a specific Svelte/Vue/Angular/[..] lib, please reach out!)

There's no code generation involved & you can pretty easily add it to your existing Next.js/CRA/Express project.

## Example

Here's an example of a tRPC procedure (aka endpoint) called `hello` that takes a `string` argument.

```tsx
const appRouter = trpc.router().query('hello', {
  input: z.string().optional(),
  resolve: ({ input }) => {
    return {
      text: `hello ${input ?? 'world'}`,
    };
  },
});

export type AppRouter = typeof appRouter;
```

And here's a type safe client using said data:

```tsx
import type { AppRouter } from './server';

async function main() {
  const client = createTRPCClient<AppRouter>({
    url: `http://localhost:2022`,
  });

  const result = await client.query('hello', '@alexdotjs');
  console.log(result); // --> { text: "hello @alexdotjs" }
}

main();
```

**That's all you need to get type safety!** The `result` is type inferred from what the backend returns in the function. The data from input is also inferred from the return of the validator, so the data is safe to use straight up - actually, you _have to_ pass the input data through a validator (& tRPC works out-of-the-box with zod/yup/custom validators).

Here's a CodeSandbox link where you can play with the example above: https://githubbox.com/trpc/trpc/tree/next/examples/standalone-server (have a look at the terminal output rather than the preview!)

**_Wat? I'm importing code from my backend to my client?_ - No, you're actually not**

Even though it might look like it, no code is shared from the server to the client; TypeScript's `import type` "[..] only imports declarations to be used for type annotations and declarations. It always gets fully erased, so there’s no remnant of it at runtime." - a feature added in TypeScript 3.8 - [see TypeScript docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#:~:text=import%20type%20only%20imports%20declarations,also%20erased%20from%20TypeScript's%20output.).

There's no code generation involved, you can this to your app today as long as you have a way to share types from the server to the client (hopefully you're using a monorepo already).

## But we're only getting started!

I mentioned before that there's a React-library, the way to use the data above in React you do:

```tsx
const { data } = trpc.useQuery(['hello', '@alexdotjs']);
```

.. and you'll get type safe data on the client.

You can add tRPC today with your existing brownfield project (got adapters for Express/Next.js) & it works fine with CRA and should work with React Native as well. It is not even tied to React, so if you want to do a Svelte or Vue lib, please get in touch with me.

## What about mutating data?

Mutations are as simple to do as queries, they're actually the same underneath, but are just exposed differently as syntactic sugar and produce a HTTP POST rather than a GET request.

Here's a little more complicated example using a database, taken from our TodoMVC example at todomvc.trpc.io / https://github.com/trpc/trpc/tree/next/examples/next-prisma-todomvc

```tsx
const todoRouter = createRouter().mutation('add', {
  input: z.object({
    id: z.string().uuid(),
    data: z.object({
      completed: z.boolean().optional(),
      text: z.string().min(1).optional(),
    }),
  }),
  async resolve({ ctx, input }) {
    const { id, data } = input;
    const todo = await ctx.task.update({
      where: { id },
      data,
    });
    return todo;
  },
});
```

And the **React usage** looks like this:

```tsx
const addTask = trpc.useMutation('todos.add');

return (
  <>
    <input
      placeholder="What needs to be done?"
      onKeyDown={(e) => {
        const text = e.currentTarget.value.trim();
        if (e.key === 'Enter' && text) {
          addTask.mutate({ text });
          e.currentTarget.value = '';
        }
      }}
    />
  </>
)
```

## End, for now.

Anyway, as I said, I just wanted to get the ball rolling. There's a lot more things:

- Creating context for incoming requests for user-specific data that are dependency injected into the resolvers - [link](/docs/v9/context)
- Middleware support for routers - [link](/docs/v9/middlewares)
- Merging routers (you probably don't want all your backend data in one file) - [link](/docs/v9/merging-routers)
- Simplest server-side rendering you've ever seen in React-land using our `@trpc/next` adapter - [link](/docs/v9/)
- Type-safe error formatting - [link](/docs/v9/error-formatting)
- Data transformers (use Date/Map/Set objects across the wire) - [link](/docs/v9/data-transformers)
- Helpers for React Query

If you want to get started there's a few examples in the [Getting Started for Next.js](/docs/v9/nextjs).

[Follow me on Twitter for updates!](https://twitter.com/alexdotjs)
