---
name: middlewares
description: >
  Create and compose tRPC middleware with t.procedure.use(), extend context via
  opts.next({ ctx }), build reusable middleware with .concat() and .unstable_pipe(),
  define base procedures like publicProcedure and authedProcedure. Access raw input
  with getRawInput(). Logging, timing, OTEL tracing patterns.
type: core
library: trpc
library_version: '11.16.0'
requires:
  - server-setup
sources:
  - 'trpc/trpc:www/docs/server/middlewares.md'
  - 'trpc/trpc:www/docs/server/authorization.md'
  - 'trpc/trpc:packages/server/src/unstable-core-do-not-import/middleware.ts'
  - 'trpc/trpc:packages/server/src/unstable-core-do-not-import/procedureBuilder.ts'
---

# tRPC -- Middlewares

## Setup

```ts
// server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';

type Context = {
  user?: { id: string; isAdmin: boolean };
};

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
```

## Core Patterns

### Auth middleware that narrows context type

```ts
// server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server';

type Context = {
  user?: { id: string; isAdmin: boolean };
};

const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const adminProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({
    ctx: {
      user: ctx.user,
    },
  });
});
```

After the middleware, `ctx.user` is non-nullable in downstream procedures.

### Logging and timing middleware

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const loggedProcedure = t.procedure.use(async (opts) => {
  const start = Date.now();

  const result = await opts.next();

  const durationMs = Date.now() - start;
  const meta = { path: opts.path, type: opts.type, durationMs };

  result.ok
    ? console.log('OK request timing:', meta)
    : console.error('Non-OK request timing', meta);

  return result;
});
```

### Reusable middleware with .concat()

```ts
// myPlugin.ts
import { initTRPC } from '@trpc/server';

export function createMyPlugin() {
  const t = initTRPC.context<{}>().meta<{}>().create();

  return {
    pluginProc: t.procedure.use((opts) => {
      return opts.next({
        ctx: {
          fromPlugin: 'hello from myPlugin' as const,
        },
      });
    }),
  };
}
```

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';
import { createMyPlugin } from './myPlugin';

const t = initTRPC.context<{}>().create();
const plugin = createMyPlugin();

export const publicProcedure = t.procedure;

export const procedureWithPlugin = publicProcedure.concat(plugin.pluginProc);
```

`.concat()` merges a partial procedure (from any tRPC instance) into your procedure chain, as long as context and meta types overlap.

### Extending middlewares with .unstable_pipe()

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const fooMiddleware = t.middleware((opts) => {
  return opts.next({
    ctx: { foo: 'foo' as const },
  });
});

const barMiddleware = fooMiddleware.unstable_pipe((opts) => {
  console.log(opts.ctx.foo);
  return opts.next({
    ctx: { bar: 'bar' as const },
  });
});

const barProcedure = t.procedure.use(barMiddleware);
```

Piped middlewares run in order and each receives the context from the previous middleware.

## Common Mistakes

### [CRITICAL] Forgetting to call and return opts.next()

Wrong:

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const logMiddleware = t.middleware(async (opts) => {
  console.log('request started');
  // forgot to call opts.next()
});
```

Correct:

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const logMiddleware = t.middleware(async (opts) => {
  console.log('request started');
  const result = await opts.next();
  console.log('request ended');
  return result;
});
```

Middleware must call `opts.next()` and return its result; forgetting this silently drops the request with an INTERNAL_SERVER_ERROR because no middleware marker is returned.

Source: packages/server/src/unstable-core-do-not-import/procedureBuilder.ts

### [HIGH] Extending context with wrong type in opts.next()

Wrong:

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const middleware = t.middleware(async (opts) => {
  return opts.next({ ctx: 'not-an-object' });
});
```

Correct:

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

async function getUser() {
  return { id: '1', name: 'Katt' };
}

const middleware = t.middleware(async (opts) => {
  return opts.next({ ctx: { user: await getUser() } });
});
```

Context extension in `opts.next({ ctx })` must be an object; passing non-object values or overwriting required keys breaks downstream procedures.

Source: www/docs/server/middlewares.md

## See Also

- `server-setup` -- initTRPC, routers, procedures, context
- `validators` -- input/output validation with Zod
- `error-handling` -- TRPCError codes used in auth middleware
- `auth` -- full auth patterns combining middleware + client headers
