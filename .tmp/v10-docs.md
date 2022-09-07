# ⚠️ Potentially outdated doc

See https://trpc.io/docs/v10/migrate-from-v9-to-v10



# [tRPC](https://trpc.io) V10

> How the the future [tRPC V10](https://trpc.io) will look like.


- [⚠️ Potentially outdated doc](#️-potentially-outdated-doc)
- [tRPC V10](#trpc-v10)
  - [Play with it!](#play-with-it)
  - [Goals & features](#goals--features)
  - [The Gist / tl;dr](#the-gist--tldr)
    - [Install now!](#install-now)
    - [Defining routers & procedures](#defining-routers--procedures)
    - [Calling procedures](#calling-procedures)
    - [Middlewares](#middlewares)
  - [New router API!](#new-router-api)
    - [§1 Basics](#1-basics)
      - [§1.0 Setting up tRPC](#10-setting-up-trpc)
      - [§1.1 Creating a router](#11-creating-a-router)
      - [§1.2 Defining a procedure](#12-defining-a-procedure)
        - [Details about the procedure builder](#details-about-the-procedure-builder)
      - [§1.3 Adding input parser](#13-adding-input-parser)
      - [§1.4 Procedure with middleware](#14-procedure-with-middleware)
      - [§1.4 Child / sub routers](#14-child--sub-routers)
    - [§2 Intermediate 🍿](#2-intermediate-)
      - [§2.1 Define a reusable middleware](#21-define-a-reusable-middleware)
      - [§2.2 Create a bunch of procedures that are all protected](#22-create-a-bunch-of-procedures-that-are-all-protected)
      - [§2.3 Define an `output` schema](#23-define-an-output-schema)
      - [§2.4 Merging routers](#24-merging-routers)
    - [§3 Advanced 🧙](#3-advanced-)
      - [Compose dynamic combos of middlewares/input parsers](#compose-dynamic-combos-of-middlewaresinput-parsers)
  - [New Raw client API!](#new-raw-client-api)
  - [New React-API (🚧🚧)](#new-react-api-)
    - [Open questions](#open-questions)
    - [New `@trpc/next`-APIs (🚧🚧)](#new-trpcnext-apis-)
    - [New Links architecture](#new-links-architecture)
  - [Migration path & Interopability mode](#migration-path--interopability-mode)

## Play with it!


**Playground link:** https://stackblitz.com/github/trpc/trpc/tree/next/examples/standalone-server?file=src%2Fserver.ts,src%2Fclient.ts&view=editor


1. Go to `src/server.ts` in sandbox
2. Try adding/removing/changing queries and mutations.
3. Go to `src/client.ts` and play around

## Goals & features

- **More ergonomic API for creating procedures** and building out your backend
- **CMD+Click** from a your frontend and jump straight into the backend procedure, change the name of routers and procedures by simply right-clicking! This will work with `react-query` as well!
- **Better scaling** than current structure! The new version has been tested with 2,000 procedures still acts alright, where the current V9.x version starts slowing doing noticeably at ~100 procedures. *(Note: this testing with very basic procedures, for large projects you still have to use [Project References](https://github.com/microsoft/TypeScript/wiki/Performance#using-project-references))*

## The Gist / tl;dr

The main difference between the old and the new router is that "the chaining" is shifted from the Router to each Procedure.

### Install now!

```bash
npm install @trpc/server@experimental @trpc/client@experimental @trpc/react@experimental @trpc/next@experimental 
```

### Defining routers & procedures

```ts
// OLD:
const appRouter = trpc
  .router()
  .query('greeting', {
    input: z.string(),
    resolve({input}) {
      return `hello ${input}!`
    }
  })

// NEW:
const appRouter = t.router({
  greeting: t
    .procedure
    .input(z.string())
    .query(({ input }) => `hello ${input}!`)
})
```

### Calling procedures

```ts
// OLD
client.query('greeting', 'KATT')
trpc.useQuery(['greeting', 'KATT'])

// NEW - you'll be able to CMD+click `greeting` below and jump straight to your backend code
client.greeting('KATT')
trpc.greeting.useQuery('KATT')
```

### Middlewares

```ts
// OLD
const appRouter = trpc
  .router()
  .middleware(({next, ctx}) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" }) 
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      }
    })
  })
  .query('greeting', {
    resolve({input}) {
      return `hello ${ctx.user.name}!`
    }
  })

// NEW
const isAuthed = t.middleware(({next, ctx}) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" }) 
  }

  return next({
    ctx: {
      user: ctx.user,
    }
  })
})

// Reusable:
const authedProcedure = t.procedure.use(isAuthed)

const appRouter = t.router({
  greeting: authedProcedure.query(({ ctx }) => `hello ${ctx.name}!`)
})
```

## New router API! 

### §1 Basics


#### §1.0 Setting up tRPC

```tsx
// server/trpc.ts
type Context = {
  user?: {
    id: string;
    memberships: {
      organizationId: string;
    }[];
  };
};

export const t = initTRPC
  .context<Context>()
  .create({
    /* optional */
    transformer: superjson,
    // errorFormatter: [...]
  });

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
} = t;
```

#### §1.1 Creating a router

```tsx
export const appRouter = t.router({
  // [...]
})
```

#### §1.2 Defining a procedure

```tsx
export const appRouter = t.router({
  // simple procedure without args available at postAll`
  postList: procedure.query(() => postsDb),
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
  query(
    resolver: (
      opts: ResolveOptions<TParams>,
    ) => $TOutput,
  ): Procedure;
  mutation(
    resolver: (
      opts: ResolveOptions<TParams>,
    ) => $TOutput,
  ): Procedure;
}
```

#### §1.3 Adding input parser

> Note that I'll skip the `t.router({ /*...*/})` below here

```tsx

// get post by id or 404 if it's not found
const appRouter = t.router({
  postById: procedure
  .input(
    z.object({
      id: z.string(),
    }),
  )
  .query(({ input }) => {
    const post = postsDb.find((post) => post.id === input.id);
    if (!post) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return {
      data: postsDb,
    };
  })
});
```

#### §1.4 Procedure with middleware

```tsx
t.router({
  whoami: t.procedure
    .use((params) => {
      if (!params.ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return params.next({
        ctx: {
          // User is now set on the ctx object
          user: params.ctx.user,
        },
      });
    })
    .query(({ ctx }) => {
      // `isAuthed()` will propagate new `ctx`
      // `ctx.user` is now `NonNullable`
      return `your id is ${ctx.user.id}`;
    });
});

```

#### §1.4 Child / sub routers

```ts
const appRouter = t.router({
  // A procedure on the `appRouter`
  health: t.procedure.query(() => 'healthy')
  post: t.router({
    byId: t
      .procedure
      .input(
        z.object({ id: z.string( )})
      )
      .query(() => '....'),
  }),
  user: t.router({
    byId: t
      .procedure
      .input(
        z.object({ id: z.string( )})
      )
      .query(() => '....'),
  }),
})

```


### §2 Intermediate 🍿 

#### §2.1 Define a reusable middleware

```tsx

const isAuthed = t.middleware((params) => {
  if (!params.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return params.next({
    ctx: {
      user: params.ctx.user,
    },
  });
});

// Use in procedure:
t.router({
  whoami: procedure
    .use(isAuthed)
    .query(({ ctx }) => {
      // `isAuthed()` will propagate new `ctx`
      // `ctx.user` is now `NonNullable`
      return `your id is ${ctx.user.id}`;
    });
});
```


#### §2.2 Create a bunch of procedures that are all protected

```tsx
const protectedProcedure = procedure.use(isAuthed);

export const appRouter = t.router({
  postList: protectedProcedure.query(() => postsDb),
  postById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ input }) => {
      const post = postsDb.find((post) => post.id === input.id);
      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return {
        data: postsDb,
      };
    })
})
```

#### §2.3 Define an `output` schema



```tsx
procedure
  .output(z.void())
  // This will fail because we've explicitly said this procedure is `void`
  .query(({ input }) => {
    return'hello';
  })
```

#### §2.4 Merging routers

```ts
const postRouter = t.router({
  postList: protectedProcedure.query(() => postsDb),
  postById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ input }) => {
      const post = postsDb.find((post) => post.id === input.id);
      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return {
        data: postsDb,
      };
    })
})

const health = t.router({
  healthz: t.procedure.query(() => 'I am alive')
})

export const appRouter = t.mergeRouters(
  postRouter,
  health
);
```


### §3 Advanced 🧙 

#### Compose dynamic combos of middlewares/input parsers

> Not for the faint-hearted. This will likely be removed

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
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    if (
      !user.memberships.some(
        (membership) => membership.organizationId !== input.organizationId,
      )
    ) {
      throw new TRPCError({ code: 'FORBIDDEN' });
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
  .mutation(({ ctx, input }) => {
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



## New Raw client API!


Client API Proposal with `Proxy`. Jump from the client to the and jump straight into the backend definition with 1 click!


```ts
import type { appRouter } from './server';
import { createClient, createClientProxy } from '@trpc/client';

const client = createClient<typeof appRouter>();
const proxy = createClientProxy(client);

async function main() {
  // you can CMD+click `postById` here and jump straight into your backend
  const byId1 = await proxy.postById.query({  id: '1' });

  // with meta data:
  const byId2 = await proxy.postById.query({ 
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



```ts
import { trpc } from '~/utils/trpc';

function MyComponent() {
  // You'll be able to CMD+Click `postById` below
  const query = trpc.postById.useQuery(
    { id: 1 },
    {
      /* [...] trpc specific options */
      context: {
        batching: false,
      },
      ssr: true,
      enabled: true,
      /* [...] react-query specific options */
    }
  )

}

```

### Open questions

- Still some unclarity about React 18, RSC, `Suspense` and stuff? Hard to predict the future.
- Should this be renamed to `@trpc/react-query`? With React 18 & RSC, `react-query` might become less of the norm.
- [...]


### New `@trpc/next`-APIs (🚧🚧)


Simpler setup:

```ts
// `utils/trpc.ts`

/**
 * A set of strongly-typed React hooks from your `AppRouter` type signature with `createReactQueryHooks`.
 * @link https://trpc.io/docs/react#3-create-trpc-hooks
 */
export const trpc = createTRPCNext<AppRouter>({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  config() {
    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/ssr
     */
    return {
      /**
       * @link https://trpc.io/docs/data-transformers
       */
      transformer: superjson,
      /**
       * @link https://trpc.io/docs/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        getEndingLink(),
      ],
      /**
       * @link https://react-query.tanstack.com/reference/QueryClient
       */
      // queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
    };
  },
  /**
   * @link https://trpc.io/docs/ssr
   */
  ssr: true,
  /**
   * Set headers or status code when doing SSR
   */
  responseMeta(opts) {
    // [...]
    return {};
  },
});
```


```ts
// _app.tsx
import { AppType } from 'next/dist/shared/lib/utils';
import { ReactElement, ReactNode } from 'react';
import { trpc } from '~/utils/trpc';

const MyApp: AppType = (({ Component, pageProps }) => {
  return <Component {...pageProps} />;
})

export default trpc.withTRPC(MyApp);
```



### New Links architecture


Only relevant if you're making custom links, but it's a more flexible structure that will allow us to write slimmer React-wrappers, etc.

https://alpha.trpc.io/docs/links#creating-a-custom-link


## Migration path & Interopability mode

👉 Moved to [alpha.trpc.io/docs/migrate-from-v9-to-v10](https://trpc.io/docs/v10/migrate-from-v9-to-v10)
