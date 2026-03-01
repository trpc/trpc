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
// @filename: trpc.ts
import {
  createTRPCReact,
  type inferReactQueryProcedureOptions,
} from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server';
export type ReactQueryOptions = inferReactQueryProcedureOptions<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export const trpc = createTRPCReact<AppRouter>();

// @filename: usePostCreate.ts
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
    onSuccess(post, variables, context, mutation) {
      // invalidate all queries on the post router
      // when a new post is created
      utils.post.invalidate();
      options?.onSuccess?.(post, variables, context, mutation);
    },
  });
}
```

```ts twoslash title='usePostById.ts'
// @module: esnext
// @include: server
// @filename: trpc.ts
import {
  createTRPCReact,
  type inferReactQueryProcedureOptions,
} from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server';
export type ReactQueryOptions = inferReactQueryProcedureOptions<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export const trpc = createTRPCReact<AppRouter>();

// @filename: usePostById.ts
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
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t2 = initTRPC.create();
export const t = t2;
export const publicProcedure = t2.procedure;

// @filename: factory.ts
// ---cut---

import { z } from 'zod';
import { t, publicProcedure } from './trpc';

// @trpc/react-query/shared exports several **Like types which can be used to generate abstract types
import { RouterLike, UtilsLike } from '@trpc/react-query/shared';

const ThingRequest = z.object({ name: z.string() });
const Thing = z.object({ id: z.string(), name: z.string() });
const ThingQuery = z.object({ filter: z.string().optional() });
const ThingArray = z.array(Thing);

// Factory function written by you, however you need,
// so long as you can infer the resulting type of t.router() later
export function createMyRouter() {
  return t.router({
    createThing: publicProcedure
      .input(ThingRequest)
      .output(Thing)
      .mutation(({ input }) => ({ id: '1', ...input })),
    listThings: publicProcedure
      .input(ThingQuery)
      .output(ThingArray)
      .query(() => []),
  })
}

// Infer the type of your router, and then generate the abstract types for use in the client
type MyRouterType = ReturnType<typeof createMyRouter>
export type MyRouterLike = RouterLike<MyRouterType>
export type MyRouterUtilsLike = UtilsLike<MyRouterType>
```

```tsx twoslash title='api/server.ts'
// @module: esnext
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t2 = initTRPC.create();
export const t = t2;
export const publicProcedure = t2.procedure;

// @filename: factory.ts
import { z } from 'zod';
import { t, publicProcedure } from './trpc';
import { RouterLike, UtilsLike } from '@trpc/react-query/shared';
const ThingRequest = z.object({ name: z.string() });
const Thing = z.object({ id: z.string(), name: z.string() });
const ThingQuery = z.object({ filter: z.string().optional() });
const ThingArray = z.array(Thing);
export function createMyRouter() {
  return t.router({
    createThing: publicProcedure.input(ThingRequest).output(Thing).mutation(({ input }) => ({ id: '1', ...input })),
    listThings: publicProcedure.input(ThingQuery).output(ThingArray).query(() => []),
  })
}
type MyRouterType = ReturnType<typeof createMyRouter>
export type MyRouterLike = RouterLike<MyRouterType>
export type MyRouterUtilsLike = UtilsLike<MyRouterType>

// @filename: app-server.ts
import { t } from './trpc';
import { createMyRouter } from './factory';
const appRouter = t.router({ things: createMyRouter() });

// ---cut---

export type AppRouter = typeof appRouter;

// Export your MyRouter types to the client
export type { MyRouterLike, MyRouterUtilsLike } from './factory';
```

```tsx twoslash title='frontend/usePostCreate.ts'
// @module: esnext
// @jsx: react-jsx
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t2 = initTRPC.create();
export const t = t2;
export const publicProcedure = t2.procedure;

// @filename: factory.ts
import { z } from 'zod';
import { t, publicProcedure } from './trpc';
import { RouterLike, UtilsLike } from '@trpc/react-query/shared';
const ThingRequest = z.object({ name: z.string() });
const Thing = z.object({ id: z.string(), name: z.string() });
const ThingQuery = z.object({ filter: z.string().optional() });
const ThingArray = z.array(Thing);
export function createMyRouter() {
  return t.router({
    createThing: publicProcedure.input(ThingRequest).output(Thing).mutation(({ input }) => ({ id: '1', ...input })),
    listThings: publicProcedure.input(ThingQuery).output(ThingArray).query(() => []),
    doThing: publicProcedure.input(z.object({ name: z.string() })).mutation(({ input }) => input),
  })
}
type MyRouterType = ReturnType<typeof createMyRouter>
export type MyRouterLike = RouterLike<MyRouterType>
export type MyRouterUtilsLike = UtilsLike<MyRouterType>

// @filename: app-router.ts
import { t } from './trpc';
import { createMyRouter } from './factory';
const appRouter = t.router({
  deep: t.router({
    route: t.router({
      things: createMyRouter(),
    }),
  }),
  different: t.router({
    things: createMyRouter(),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: trpc-client.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './app-router';
export const trpc = createTRPCReact<AppRouter>();

// @filename: use-post-create.tsx
import { trpc } from './trpc-client';
const useUtils = trpc.useUtils;
// ---cut---
import type { MyRouterLike, MyRouterUtilsLike } from './factory';

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

  return null; /* ui */
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

A more complete working example [can be found here](https://github.com/trpc/trpc/tree/main/packages/tests/server/react/polymorphism.test.tsx)
