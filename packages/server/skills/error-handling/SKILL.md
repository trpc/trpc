---
name: error-handling
description: >
  Throw typed errors with TRPCError and error codes (NOT_FOUND, UNAUTHORIZED,
  BAD_REQUEST, INTERNAL_SERVER_ERROR), configure errorFormatter for client-side
  Zod error display, handle errors globally with onError callback, map tRPC errors
  to HTTP status codes with getHTTPStatusCodeFromError().
type: core
library: trpc
library_version: '11.14.0'
requires:
  - server-setup
sources:
  - 'trpc/trpc:www/docs/server/error-handling.md'
  - 'trpc/trpc:www/docs/server/error-formatting.md'
  - 'trpc/trpc:packages/server/src/unstable-core-do-not-import/error/TRPCError.ts'
---

# tRPC -- Error Handling

## Setup

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';

const t = initTRPC.create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
```

## Core Patterns

### Throwing typed errors from procedures

```ts
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  userById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const user = getUserFromDb(input.id);
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `User with id ${input.id} not found`,
        });
      }
      return user;
    }),
});

function getUserFromDb(id: string) {
  if (id === '1') return { id: '1', name: 'Katt' };
  return null;
}
```

### Wrapping original errors with cause

```ts
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  riskyOperation: publicProcedure.mutation(async () => {
    try {
      return await externalService();
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred, please try again later.',
        cause: err,
      });
    }
  }),
});

async function externalService() {
  throw new Error('connection refused');
}
```

Pass the original error as `cause` to retain the stack trace for debugging.

### Global error handling with onError

```ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';

const server = createHTTPServer({
  router: appRouter,
  onError(opts) {
    const { error, type, path, input, ctx, req } = opts;
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting service
    }
  },
});

server.listen(3000);
```

### Extracting HTTP status from TRPCError

```ts
import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';

function handleError(error: unknown) {
  if (error instanceof TRPCError) {
    const httpCode = getHTTPStatusCodeFromError(error);
    console.log(httpCode); // e.g., 400, 401, 404, 500
  }
}
```

## Common Mistakes

### [HIGH] Throwing plain Error instead of TRPCError

Wrong:

```ts
import { publicProcedure } from './trpc';

const proc = publicProcedure.query(() => {
  throw new Error('Not found');
  // client receives 500 INTERNAL_SERVER_ERROR
});
```

Correct:

```ts
import { TRPCError } from '@trpc/server';
import { publicProcedure } from './trpc';

const proc = publicProcedure.query(() => {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'User not found',
  });
  // client receives 404 NOT_FOUND
});
```

Plain Error objects are caught and wrapped as INTERNAL_SERVER_ERROR (500); use TRPCError with a specific code for proper HTTP status mapping.

Source: www/docs/server/error-handling.md

### [MEDIUM] Expecting stack traces in production

Wrong:

```ts
import { initTRPC } from '@trpc/server';

// No explicit isDev setting
const t = initTRPC.create();
// Stack traces may or may not appear depending on NODE_ENV
```

Correct:

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create({
  isDev: process.env.NODE_ENV === 'development',
});
```

Stack traces are included only when `isDev` is true (default: `NODE_ENV !== "production"`); set `isDev` explicitly for deterministic behavior across runtimes.

Source: www/docs/server/error-handling.md

### [HIGH] Not handling Zod errors in errorFormatter

Wrong:

```ts
import { initTRPC } from '@trpc/server';

// No errorFormatter -- client gets generic "Input validation failed"
const t = initTRPC.create();
```

Correct:

```ts
import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';

const t = initTRPC.create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});
```

Without a custom errorFormatter, the client receives a generic message without field-level validation details from Zod.

Source: www/docs/server/error-formatting.md

## Error Code Reference

| Code                  | HTTP | Use when                             |
| --------------------- | ---- | ------------------------------------ |
| BAD_REQUEST           | 400  | Invalid input                        |
| UNAUTHORIZED          | 401  | Missing or invalid auth credentials  |
| FORBIDDEN             | 403  | Authenticated but not authorized     |
| NOT_FOUND             | 404  | Resource does not exist              |
| CONFLICT              | 409  | Request conflicts with current state |
| UNPROCESSABLE_CONTENT | 422  | Valid syntax but semantic error      |
| TOO_MANY_REQUESTS     | 429  | Rate limit exceeded                  |
| INTERNAL_SERVER_ERROR | 500  | Unexpected server error              |

## See Also

- `server-setup` -- initTRPC configuration including isDev
- `validators` -- input validation that triggers BAD_REQUEST errors
- `middlewares` -- auth middleware throwing UNAUTHORIZED
- `server-side-calls` -- catching TRPCError in server-side callers
