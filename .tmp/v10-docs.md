# [tRPC](https://trpc.io) V10

> How the the future [tRPC V10](https://trpc.io) will look like.


- [tRPC V10](#trpc-v10)
  - [Play with it!](#play-with-it)
  - [Goals & features](#goals--features)
  - [New router API!](#new-router-api)
    - [⚠️ Known drawbacks ⚠️](#️-known-drawbacks-️)
    - [§1 Basics](#1-basics)
      - [§1.0 Setting up tRPC](#10-setting-up-trpc)
      - [§1.1 Creating a router](#11-creating-a-router)
      - [§1.2 Defining a procedure](#12-defining-a-procedure)
        - [Details about the procedure builder](#details-about-the-procedure-builder)
      - [§1.3 Adding input parser](#13-adding-input-parser)
      - [§1.4 Procedure with middleware](#14-procedure-with-middleware)
    - [§2 Intermediate 🍿](#2-intermediate-)
      - [§2.1 Define a reusable middleware](#21-define-a-reusable-middleware)
      - [§2.2 Create a bunch of procedures that are all protected](#22-create-a-bunch-of-procedures-that-are-all-protected)
      - [§2.3 Define an `output` schema](#23-define-an-output-schema)
      - [§2.4 Merging routers](#24-merging-routers)
    - [§3 Advanced 🧙](#3-advanced-)
      - [Compose dynamic combos of middlewares/input parsers](#compose-dynamic-combos-of-middlewaresinput-parsers)
    - [Interopability mode for old routers](#interopability-mode-for-old-routers)
  - [New Raw client API!](#new-raw-client-api)
  - [New React-API (🚧🚧)](#new-react-api-)
    - [Outstanding questions](#outstanding-questions)
    - [New `@trpc/next`-API (🚧🚧)](#new-trpcnext-api-)

## Play with it!


**Playground link:** https://stackblitz.com/github/trpc/trpc/tree/next/examples/standalone-server


1. Go to `src/server.ts` in sandbox
2. Try adding/removing/changing queries and mutations.
3. Go to `src/client.ts` and play around

## Goals & features

- **More ergonomic API for creating procedures** and building out your backend
- **CMD+Click** from a your frontend and jump straight into the backend procedure. This will work with `react-query` as well!
- **Enabling having a file**-based structure - as you see, that `createRouter()` could easily be automatically generated from a file/folder structure.
- **Better scaling** than current structure! The new version has been tested with 2,000 procedures still acts alright, where the current V9.x version starts slowing doing noticeably at ~100 procedures. *(Note: this testing with very basic procedures, for large projects you still have to use [Project References](https://github.com/microsoft/TypeScript/wiki/Performance#using-project-references))*
- ~**Infer expected errors** as well as data - unsure if this is useful yet or if it'll make it, but pretty sure it'll be nice to have.~ Skipped this because of it's complexity - it can still be added later.

## New router API! 

### ⚠️ Known drawbacks ⚠️

Router merging with a prefix in the new API will **not** be supported. All queries a mutations will lie flat on one big object.

We might revisit this decision in the future, the reason here is that it **breaks jump-to-definition** (CMD+Clicking from client to server).

### §1 Basics


#### §1.0 Setting up tRPC

```tsx
type Context = {
  user?: {
    id: string;
    memberships: {
      organizationId: string;
    }[];
  };
};

const trpc = initTRPC<Context>();

const {
  /**
   * Builder object for creating procedures
   */
  procedure,
  /**
   * Create reusable middlewares
   */
  middleware,
  /**
   * Create a router
   */
  router,
  /**
   * Merge Routers
   */
  mergeRouters,
} = trpc;
```

#### §1.1 Creating a router

```tsx
export const appRouter = trpc.router({
  queries: {
    // [...]
  },
  mutations: {
    // [...]
  },
})
```

#### §1.2 Defining a procedure

```tsx
export const appRouter = trpc.router({
  queries: {
    // simple procedure without args avialable at postAll`
    postList: procedure.resolve(() => postsDb),
  }
});
```

##### Details about the procedure builder

Simplified to be more readable - see full implementation in https://github.com/trpc/v10-playground/blob/katt/procedure-chains/src/trpc/server/procedure.ts

```tsx

interface ProcedureBuilder {
  /**
   * Add an input parser to the procedure.
   */
  input(
    schema: $TParser,
  ): ProcedureBuilder;
  /**
   * Add an output parser to the procedure.
   */
  output(
    schema: $TParser,
  ): ProcedureBuilder;
  /**
   * Add a middleware to the procedure.
   */
  use(
    fn: MiddlewareFunction<TParams, $TParams>,
  ): ProcedureBuilder
  /**
   * Extend the procedure with another procedure
   */
  concat(
    proc: ProcedureBuilder,
  ): ProcedureBuilder;
  resolve(
    resolver: (
      opts: ResolveOptions<TParams>,
    ) => $TOutput,
  ): Procedure;
}
```

#### §1.3 Adding input parser

> Note that I'll skip the `trpc.router({ queries: /*...*/})` below here

```tsx

// get post by id or 404 if it's not found
const postById = procedure
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .resolve(({ input }) => {
    const post = postsDb.find((post) => post.id === input.id);
    if (!post) {
      throw new Error('NOT_FOUND');
    }
    return {
      data: postsDb,
    };
  });
```

#### §1.4 Procedure with middleware

```tsx
const whoami = procedure
  .use((params) => {
    if (!params.ctx.user) {
      throw new Error('UNAUTHORIZED');
    }
    return params.next({
      ctx: {
        // User is now set on the ctx object
        user: params.ctx.user,
      },
    });
  })
  .resolve(({ ctx }) => {
    // `isAuthed()` will propagate new `ctx`
    // `ctx.user` is now `NonNullable`
    return `your id is ${ctx.user.id}`;
  });
 
```

### §2 Intermediate 🍿 

#### §2.1 Define a reusable middleware

```tsx

const isAuthed = trpc.middleware((params) => {
  if (!params.ctx.user) {
    throw new Error('zup');
  }
  return params.next({
    ctx: {
      user: params.ctx.user,
    },
  });
});

// Use in procedure:
const whoami = procedure
  .use(isAuthed)
  .resolve(({ ctx }) => {
    // `isAuthed()` will propagate new `ctx`
    // `ctx.user` is now `NonNullable`
    return `your id is ${ctx.user.id}`;
  });
```


#### §2.2 Create a bunch of procedures that are all protected

```tsx
const protectedProcedure = procedure.use(isAuthed);

export const appRouter = trpc.router({
  queries: {
    postList: protectedProcedure.resolve(() => postsDb),
    postById: protectedProcedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .resolve(({ input }) => {
        const post = postsDb.find((post) => post.id === input.id);
        if (!post) {
          throw new Error('NOT_FOUND');
        }
        return {
          data: postsDb,
        };
      })
 }
})
```

#### §2.3 Define an `output` schema



```tsx
procedure
      .output(z.void())
      // This will fail because we've explicitly said this procedure is `void`
      .resolve(({ input }) => {
        return'hello';
      })
```

#### §2.4 Merging routers

```ts
const postRouter = trpc.router({
  queries: {
    postList: protectedProcedure.resolve(() => postsDb),
    postById: protectedProcedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .resolve(({ input }) => {
        const post = postsDb.find((post) => post.id === input.id);
        if (!post) {
          throw new Error('NOT_FOUND');
        }
        return {
          data: postsDb,
        };
      })
  }
})

const health = trpc.router({
  query: {
    healthz: trpc.resolve(() => 'I am alive')
  }
})

export const appRouter = trpc.mergeRouters(
  postRouter,
  health
);
```


### §3 Advanced 🧙 

#### Compose dynamic combos of middlewares/input parsers

```tsx

/**
 * A reusable combination of an input + middleware that can be reused.
 * Accepts a Zod-schema as a generic.
 */
function isPartOfOrg<
  TSchema extends z.ZodObject<{ organizationId: z.ZodString }>,
>(schema: TSchema) {
  return procedure.input(schema).use((params) => {
    const { ctx, input } = params;
    const { user } = ctx;
    if (!user) {
      throw new Error('UNAUTHORIZED');
    }

    if (
      !user.memberships.some(
        (membership) => membership.organizationId !== input.organizationId,
      )
    ) {
      throw new Error('FORBIDDEN');
    }

    return params.next({
      ctx: {
        user,
      },
    });
  });
}



const editOrganization = procedure
  .concat(
    isPartOfOrg(
      z.object({
        organizationId: z.string(),
        data: z.object({
          name: z.string(),
        }),
      }),
    ),
  )
  .resolve(({ ctx, input }) => {
    // - User is guaranteed to be part of the organization queried
    // - `input` is of type:
      // {
      //   data: {
      //       name: string;
      //   };
      //   organizationId: string;
      // }

    // [.... insert logic here]
  });
```

### Interopability mode for old routers

If you are migrating from V9->V10, the transition will be very simple. 

**1. Add `.interop()`**

All you'll need to do is to add an `.interop()` at the end of your `appRouter`. Example: https://github.com/trpc/trpc/blob/ad25239cefd972494bfff49a869b9432fd2f403f/examples/.interop/next-prisma-starter/src/server/routers/_app.ts#L37

When you've done this, you can start migrating to the new way of doing things.

**2. Create the `t`-object**

```ts
// src/server/trpc.ts
import { Context } from './context';
import superjson from 'superjson';

export const t = initTRPC<{
  ctx: Context
}>()({
  // Optional:
  transformer: superjson,
});
```

**3. Create a new `appRouter`**


1. Rename your old `appRouter` to `legacyRouter`
2. Create a new app router: 
  ```ts
  import { t } from './trpc';

  const legacyRouter = trpc
    .router()
    /* [...] */
    .interop()

  export const appRouter = t.merge(legacyRouter);

  ```
3. See if your app still builds
4. Create a a test router:
  ```ts
  const greetingRouter = t.router({
    query: {
      greeting: t.procedure.resolve(() => 'world')
    }
  })
  ```
5. Merge it in:
  ```ts
  export const appRouter = t.merge(legacyRouter, greetingRouter)
  ```


## New Raw client API!


Client API Proposal with `Proxy`. Jump from the client to the and jump straight into the backend definition with 1 click!


```ts
import type { appRouter } from './server';
import { createClient } from '@trpc/client';

const client = createClient<typeof appRouter>();

async function main() {
  // you can CMD+click `postById` here and jump straight into your backend
  const byId1 = await client.queries.postById({  id: '1' });

  // with meta data:
  const byId2 = await client.queries.postById({ 
    { id: '2' },
    context: {
      batch: false,
    }
  );


  // For backwards compatability:
  const list = await client.query('postList');
}
```

## New React-API (🚧🚧)



🚧🚧


The running idea is to be able to do something similar to this:

```ts
import { trpc } from '~/utils/trpc';

function MyComponent() {
  // You'll be able to CMD+Click `postById` below
  const query = trpc.queries.postById.use(
    { id: 1 },
    {
      trpc: {
        /* [...] trpc specific options */
        context: {
          batching: false,
        },
        ssr: true,
      },
      enabled: true,
      /* [...] react-query specific options */
    }
  )

}

```

### Outstanding questions

- Still some unclarity about React 18, RSC, `Suspense` and stuff
- Should this be renamed to `@trpc/react-query`? With React 18 & RSC, `react-query` might become less of the norm.
- Is the above API good? Unfortunately, it won't work to CMD+Click without something like that because of this missing feature in TypeScript: https://github.com/microsoft/TypeScript/issues/49033
- [...]


### New `@trpc/next`-API (🚧🚧)


🚧🚧