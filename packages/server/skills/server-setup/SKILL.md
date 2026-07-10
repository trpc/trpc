---
name: server-setup
description: >
  Initialize tRPC with initTRPC.create(), define routers with t.router(),
  create procedures with .query()/.mutation()/.subscription(), configure context
  with createContext(), export AppRouter type, merge routers with t.mergeRouters(),
  lazy-load routers with lazy().
type: core
library: trpc
library_version: '11.16.0'
requires: []
sources:
  - 'trpc/trpc:www/docs/server/overview.md'
  - 'trpc/trpc:www/docs/server/routers.md'
  - 'trpc/trpc:www/docs/server/procedures.md'
  - 'trpc/trpc:www/docs/server/context.md'
  - 'trpc/trpc:www/docs/server/merging-routers.md'
  - 'trpc/trpc:www/docs/main/quickstart.mdx'
  - 'trpc/trpc:packages/server/src/unstable-core-do-not-import/initTRPC.ts'
  - 'trpc/trpc:packages/server/src/unstable-core-do-not-import/router.ts'
---

# tRPC -- Server Setup

## Setup

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts
// server/appRouter.ts
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

type User = { id: string; name: string };

export const appRouter = router({
  userList: publicProcedure.query(async (): Promise<User[]> => {
    return [{ id: '1', name: 'Katt' }];
  }),
  userById: publicProcedure
    .input(z.string())
    .query(async ({ input }): Promise<User> => {
      return { id: input, name: 'Katt' };
    }),
  userCreate: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }): Promise<User> => {
      return { id: '1', ...input };
    }),
});

export type AppRouter = typeof appRouter;
```

```ts
// server/index.ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';

const server = createHTTPServer({ router: appRouter });
server.listen(3000);
```

## Core Patterns

### Context with typed session

```ts
// server/context.ts
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export async function createContext(opts: CreateHTTPContextOptions) {
  const token = opts.req.headers['authorization'];
  return { token };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts
// server/index.ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';
import { createContext } from './context';

const server = createHTTPServer({
  router: appRouter,
  createContext,
});
server.listen(3000);
```

### Inner/outer context split for testability

```ts
// server/context.ts
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { db } from './db';

interface CreateInnerContextOptions {
  session: { user: { email: string } } | null;
}

export async function createContextInner(opts?: CreateInnerContextOptions) {
  return {
    db,
    session: opts?.session ?? null,
  };
}

export async function createContext(opts: CreateHTTPContextOptions) {
  const session = getSessionFromCookie(opts.req);
  const contextInner = await createContextInner({ session });
  return {
    ...contextInner,
    req: opts.req,
    res: opts.res,
  };
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;
```

Infer `Context` from `createContextInner` so server-side callers and tests never need HTTP request objects.

### Merging child routers

```ts
// server/routers/user.ts
import { publicProcedure, router } from '../trpc';

export const userRouter = router({
  list: publicProcedure.query(() => []),
});
```

```ts
// server/routers/post.ts
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const postRouter = router({
  create: publicProcedure
    .input(z.object({ title: z.string() }))
    .mutation(({ input }) => ({ id: '1', ...input })),
  list: publicProcedure.query(() => []),
});
```

```ts
// server/routers/_app.ts
import { router } from '../trpc';
import { postRouter } from './post';
import { userRouter } from './user';

export const appRouter = router({
  user: userRouter,
  post: postRouter,
});

export type AppRouter = typeof appRouter;
```

### Lazy-loaded routers for serverless cold starts

```ts
// server/routers/_app.ts
import { lazy } from '@trpc/server';
import { router } from '../trpc';

export const appRouter = router({
  // Short-hand when the module has exactly one router exported
  greeting: lazy(() => import('./greeting.js')),
  // Use .then() to pick a named export when the module exports multiple routers
  user: lazy(() => import('./user.js').then((m) => m.userRouter)),
});

export type AppRouter = typeof appRouter;
```

## Common Mistakes

### [CRITICAL] Calling initTRPC.create() more than once

Wrong:

```ts
// file: userRouter.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const userRouter = t.router({});

// file: postRouter.ts
import { initTRPC } from '@trpc/server';
const t2 = initTRPC.create();
export const postRouter = t2.router({});
```

Correct:

```ts
// file: trpc.ts (single file, created once)
import { initTRPC } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

Multiple tRPC instances cause type mismatches and runtime errors when routers from different instances are merged.

Source: www/docs/server/routers.md

### [HIGH] Using reserved words as procedure names

Wrong:

```ts
import { publicProcedure, router } from './trpc';

const appRouter = router({
  then: publicProcedure.query(() => 'hello'),
});
```

Correct:

```ts
import { publicProcedure, router } from './trpc';

const appRouter = router({
  next: publicProcedure.query(() => 'hello'),
});
```

Router creation throws if procedure names are "then", "call", or "apply" because these conflict with JavaScript Proxy internals.

Source: packages/server/src/unstable-core-do-not-import/router.ts

### [CRITICAL] Importing AppRouter as a value import

Wrong:

```ts
// client.ts
import { AppRouter } from '../server/router';
```

Correct:

```ts
// client.ts
import type { AppRouter } from '../server/router';
```

A non-type import pulls the entire server bundle into the client; use `import type` so it is stripped at build time.

Source: www/docs/server/routers.md

### [MEDIUM] Creating context without inner/outer split

Wrong:

```ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export function createContext({ req }: CreateExpressContextOptions) {
  return { db: prisma, user: getUserFromReq(req) };
}
```

Correct:

```ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export function createContextInner(opts: { user?: User }) {
  return { db: prisma, user: opts.user ?? null };
}

export function createContext({ req }: CreateExpressContextOptions) {
  return createContextInner({ user: getUserFromReq(req) });
}
```

Without an inner context factory, server-side callers and tests must construct HTTP request objects to get context.

Source: www/docs/server/context.md

### [HIGH] Merging routers with different transformers

Wrong:

```ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t1 = initTRPC.create({ transformer: superjson });
const t2 = initTRPC.create();

const router1 = t1.router({ a: t1.procedure.query(() => 'a') });
const router2 = t2.router({ b: t2.procedure.query(() => 'b') });

t1.mergeRouters(router1, router2);
```

Correct:

```ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.create({ transformer: superjson });

const router1 = t.router({ a: t.procedure.query(() => 'a') });
const router2 = t.router({ b: t.procedure.query(() => 'b') });

t.mergeRouters(router1, router2);
```

`t.mergeRouters()` throws at runtime if the routers were created with different transformer or errorFormatter configurations.

Source: packages/server/src/unstable-core-do-not-import/router.ts

### [CRITICAL] Importing appRouter value into client code

Wrong:

```ts
// client.ts
import { appRouter } from '../server/router';

type AppRouter = typeof appRouter;
```

Correct:

```ts
// client.ts
import type { AppRouter } from '../server/router';

// server/router.ts
export type AppRouter = typeof appRouter;
```

Importing the appRouter value bundles the entire server into the client, even if you only use `typeof`.

Source: www/docs/server/routers.md

## See Also

- `middlewares` -- add auth, logging, context extension to procedures
- `validators` -- add input/output validation with Zod
- `error-handling` -- throw and format typed errors
- `server-side-calls` -- call procedures from server code
- `adapter-standalone` -- mount on Node.js HTTP server
- `adapter-fetch` -- mount on edge runtimes
