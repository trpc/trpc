> **Playground link:** https://stackblitz.com/github/trpc/v10-playground?file=src%2Fserver%2Findex.ts,src%2Fclient.ts,src%2Fserver%2Frouters%2FpostRouter.ts&view=editor
>
> Repo: https://github.com/KATT/trpc-procedure-play

# [tRPC](https://trpc.io) V10

How the the future [tRPC](https://trpc.io)-version will look like.

## Play with it!


1. Go to `src/server.ts` in CodeSandbox
2. Try adding/removing/changing queries and mutations.
3. Go to `src/client.ts` and play around

## Goals & features

- **More ergonomic API for creating procedures** and building out your backend
- **CMD+Click** from a your frontend and jump straight into the backend procedure. This will work with `react-query` as well!
- **Enabling having a watchers**-based structure - as you see, that `createRouter()` could easily be automatically generated from a file/folder structure.
- **Better scaling** than current structure - the TypeScript server starts choking a bit when you get close to 100 procedures in your backend
- ~**Infer expected errors** as well as data - unsure if this is useful yet or if it'll make it, but pretty sure it'll be nice to have.~ Skipped this because of it's complexity - it can still be added later.

## New router API! 

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


