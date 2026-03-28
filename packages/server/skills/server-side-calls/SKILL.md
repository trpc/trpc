---
name: server-side-calls
description: >
  Call tRPC procedures directly from server code using t.createCallerFactory()
  and router.createCaller(context) for integration testing, internal server logic,
  and custom API endpoints. Catch TRPCError and extract HTTP status with
  getHTTPStatusCodeFromError(). Error handling via onError option.
type: core
library: trpc
library_version: '11.15.1'
requires:
  - server-setup
sources:
  - 'trpc/trpc:www/docs/server/server-side-calls.md'
---

# tRPC -- Server-Side Calls

## Setup

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';

type Context = { user?: { id: string } };

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
```

```ts
// server/appRouter.ts
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createCallerFactory, publicProcedure, router } from './trpc';

interface Post {
  id: string;
  title: string;
}

const posts: Post[] = [{ id: '1', title: 'Hello world' }];

export const appRouter = router({
  post: router({
    add: publicProcedure
      .input(z.object({ title: z.string().min(2) }))
      .mutation(({ input }) => {
        const post: Post = { ...input, id: `${Math.random()}` };
        posts.push(post);
        return post;
      }),
    byId: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const post = posts.find((p) => p.id === input.id);
        if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
        return post;
      }),
    list: publicProcedure.query(() => posts),
  }),
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
```

```ts
// usage
import { createCaller } from './appRouter';

const caller = createCaller({ user: { id: '1' } });
const postList = await caller.post.list();
const newPost = await caller.post.add({ title: 'New post' });
```

## Core Patterns

### Integration test with createCallerFactory

```ts
// server/appRouter.test.ts
import type { inferProcedureInput } from '@trpc/server';
import { createCaller } from './appRouter';
import type { AppRouter } from './appRouter';
import { createContextInner } from './context';

async function testAddAndGetPost() {
  const ctx = await createContextInner({ user: undefined });
  const caller = createCaller(ctx);

  const input: inferProcedureInput<AppRouter['post']['add']> = {
    title: 'Test post',
  };

  const post = await caller.post.add(input);
  const allPosts = await caller.post.list();

  console.assert(allPosts.some((p) => p.id === post.id));
}
```

### Using router.createCaller() directly

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
});

const caller = appRouter.createCaller({});
const result = await caller.greeting({ name: 'tRPC' });
```

### Error handling in a custom API endpoint

```ts
import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { appRouter } from './appRouter';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const caller = appRouter.createCaller({});

  try {
    const post = await caller.post.byId({ id: req.query.id as string });
    res.status(200).json({ data: { postTitle: post.title } });
  } catch (cause) {
    if (cause instanceof TRPCError) {
      const httpStatusCode = getHTTPStatusCodeFromError(cause);
      res.status(httpStatusCode).json({ error: { message: cause.message } });
      return;
    }
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}
```

### Caller with onError callback

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      if (input.name === 'invalid') {
        throw new Error('Invalid name');
      }
      return `Hello ${input.name}`;
    }),
});

const caller = appRouter.createCaller(
  {},
  {
    onError: (opts) => {
      console.error('An error occurred:', opts.error);
    },
  },
);
```

## Common Mistakes

### [HIGH] Using createCaller inside another procedure

Wrong:

```ts
import { appRouter } from './appRouter';
import { createCallerFactory, publicProcedure } from './trpc';

const createCaller = createCallerFactory(appRouter);

const proc = publicProcedure.query(async () => {
  const caller = createCaller({});
  return caller.post.list();
});
```

Correct:

```ts
import type { Context } from './context';
import { publicProcedure } from './trpc';

async function listPosts(ctx: Context) {
  return ctx.db.post.findMany();
}

const proc = publicProcedure.query(async ({ ctx }) => {
  return listPosts(ctx);
});
```

Calling createCaller from within a procedure re-creates context, re-runs all middleware, and re-validates input; extract shared logic into a plain function instead.

Source: www/docs/server/server-side-calls.md

### [MEDIUM] Not providing context to createCaller

Wrong:

```ts
import { appRouter } from './appRouter';

const caller = appRouter.createCaller({});
await caller.protectedRoute();
// middleware throws UNAUTHORIZED because ctx.user is undefined
```

Correct:

```ts
import { appRouter } from './appRouter';
import { createContextInner } from './context';

const ctx = await createContextInner({ user: { id: '1' } });
const caller = appRouter.createCaller(ctx);
await caller.protectedRoute();
```

`createCaller` requires a context object matching what procedures and middleware expect; passing an empty object when procedures require auth context causes runtime errors.

Source: www/docs/server/server-side-calls.md

## See Also

- `server-setup` -- initTRPC, routers, context configuration
- `middlewares` -- auth middleware that callers must satisfy
- `error-handling` -- TRPCError and getHTTPStatusCodeFromError
