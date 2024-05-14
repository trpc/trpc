---
id: infer-types
title: Inferring Types
sidebar_label: Inferring Types
slug: /client/react/infer-types
---

<!-- Reusable snippet -->

```twoslash include server
// @module: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from "zod";

const t = initTRPC.create();

const appRouter = t.router({
  post: t.router({
    list: t.procedure
      .query(() => {
        // imaginary db call
        return [{ id: 1, title: 'tRPC is the best!' }];
    }),
    byId: t.procedure
      .input(z.string())
      .query(({ input }) => {
        // imaginary db call
        return { id: 1, title: 'tRPC is the best!' };
    }),
    create: t.procedure
      .input(z.object({ title: z.string(), text: z.string(), }))
      .mutation(({ input }) => {
        // imaginary db call
        return { id: 1, ...input };
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

In addition to the type inference made available by `@trpc/server` ([see here](/docs/client/vanilla/infer-types)) this integration also provides some inference helpers for usage purely in React.

## Infer React Query options based on your router

When creating custom hooks around tRPC procedures, it's sometimes necessary to have the types of the options inferred from the router. You can do so via the `inferReactQueryProcedureOptions` helper exported from `@trpc/react-query`.

```ts twoslash title='trpc.ts'
// @module: esnext
// @include: server
// @filename: trpc.ts
// ---cut---
import {
  createTRPCReact,
  type inferReactQueryProcedureOptions,
} from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server';

// infer the types for your router
export type ReactQueryOptions = inferReactQueryProcedureOptions<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const trpc = createTRPCReact<AppRouter>();
```

```ts twoslash title='usePostCreate.ts'
// @module: esnext
// @include: server
// @filename: usePostCreate.ts
// @noErrors
// ---cut---
import {
  trpc,
  type ReactQueryOptions,
  type RouterInputs,
  type RouterOutputs,
} from './trpc';

type PostCreateOptions = ReactQueryOptions['post']['create'];

function usePostCreate(options?: PostCreateOptions) {
  const utils = trpc.useUtils();

  return trpc.post.create.useMutation({
    ...options,
    onSuccess(post) {
      // invalidate all queries on the post router
      // when a new post is created
      utils.post.invalidate();
      options?.onSuccess?.(post);
    },
  });
}
```

```ts twoslash title='usePostById.ts'
// @module: esnext
// @include: server
// @filename: usePostById.ts
// @noErrors
// ---cut---
import { ReactQueryOptions, RouterInputs, trpc } from './trpc';

type PostByIdOptions = ReactQueryOptions['post']['byId'];
type PostByIdInput = RouterInputs['post']['byId'];

function usePostById(input: PostByIdInput, options?: PostByIdOptions) {
  return trpc.post.byId.useQuery(input, options);
}
```

## Infer abstract types from a "Router Factory"

If you write a factory which creates a similar router interface several times in your application, you may wish to share client code between usages of the factory. `@trpc/react-query/shared` exports several types which can be used to generate abstract types for a router factory, and build common React components which are passed the router as a prop.

```tsx twoslash title='api/factory.ts'
// @module: esnext
// @include: server
// @noErrors
// ---cut---

import { t, publicProcedure } from './trpc';

// @trpc/react-query/shared exports several **Like types which can be used to generate abstract types
import { RouterLike, UtilsLike } from '@trpc/react-query/shared';

// Factory function written by you, however you need,
// so long as you can infer the resulting type of t.router() later
export function createMyRouter() {
  return t.router({
    createThing: publicProcedure
      .input(ThingRequest)
      .output(Thing)
      .mutation(/* do work */),
    listThings: publicProcedure
      .input(ThingQuery)
      .output(ThingArray)
      .query(/* do work */),
  })
}

// Infer the type of your router, and then generate the abstract types for use in the client
type MyRouterType = ReturnType<typeof createMyRouter>
export MyRouterLike = RouterLike<MyRouterType>
export MyRouterUtilsLike = UtilsLike<MyRouterType>
```

```tsx twoslash title='api/server.ts'
// @module: esnext
// @include: server
// @noErrors
// ---cut---

export type AppRouter = typeof appRouter;

// Export your MyRouter types to the client
export type { MyRouterLike, MyRouterUtilsLike } from './factory';
```

```tsx twoslash title='frontend/usePostCreate.ts'
// @module: esnext
// @include: server
// @noErrors
// ---cut---
import type { MyRouterLike, MyRouterUtilsLike, trpc, useUtils } from './trpc';

type MyGenericComponentProps = {
  route: MyRouterLike;
  utils: MyRouterUtilsLike;
};

function MyGenericComponent(props: MyGenericComponentProps) {
  const { route } = props;
  const thing = route.listThings.useQuery({
    filter: 'qwerty',
  });

  const mutation = route.doThing.useMutation({
    onSuccess() {
      props.utils.listThings.invalidate();
    },
  });

  function handleClick() {
    mutation.mutate({
      name: 'Thing 1',
    });
  }

  return; /* ui */
}

function MyPageComponent() {
  const utils = useUtils();

  return (
    <MyGenericComponent
      route={trpc.deep.route.things}
      utils={utils.deep.route.things}
    />
  );
}

function MyOtherPageComponent() {
  const utils = useUtils();

  return (
    <MyGenericComponent
      route={trpc.different.things}
      utils={utils.different.things}
    />
  );
}
```

A more complete working example [can be found here](https://github.com/trpc/trpc/tree/next/packages/tests/server/react/polymorphism.test.tsx)
