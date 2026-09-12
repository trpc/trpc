---
id: error-formatting
title: Error Formatting
sidebar_label: Error Formatting
slug: /server/error-formatting
---

The error formatting in your router will be inferred all the way to your client.

## Usage example highlighted

### Adding custom formatting

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';

export const t = initTRPC.create({
  errorFormatter(opts) {
    const { shape, error } = opts;
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

### Usage in React

```tsx twoslash title='components/MyComponent.tsx'
// @jsx: react-jsx
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import { z } from 'zod';

const t = initTRPC.create({
  errorFormatter(opts) {
    const { shape, error } = opts;
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
export const appRouter = t.router({
  addPost: t.procedure.input(z.object({ title: z.string() })).mutation(({ input }) => input),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: components/MyComponent.tsx
// ---cut---
import { useEffect } from 'react';
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const mutation = trpc.addPost.useMutation();

  useEffect(() => {
    mutation.mutate({ title: 'example' });
  }, []);

  if (mutation.error?.data?.zodError) {
    // zodError will be inferred
    return (
      <pre>Error: {JSON.stringify(mutation.error.data.zodError, null, 2)}</pre>
    );
  }
  return <>[...]</>;
}
```

## Per-procedure error formatting

The procedure builder has an `.errors()` method, which lets a procedure describe
the errors _it_ can throw without every other procedure having to know about
them.

Formatters get first refusal on an error from the tail of the chain backwards -
the most recently added one runs first. Returning a shape ends the chain and
that shape goes straight to the client. Returning `undefined` declines the
error, handing it to the next formatter towards the head, and finally to the
router-wide `errorFormatter` if none of them take it.

```ts twoslash title='server.ts'
import { initTRPC, TRPCError } from '@trpc/server';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

const t = initTRPC.create();

// ---cut---
const rateLimitedProcedure = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  return undefined;
});

export const appRouter = t.router({
  sendMessage: rateLimitedProcedure.mutation(() => {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      cause: new RateLimitError(5_000),
    });
  }),
});
```

`opts.shape` is always the `DefaultErrorShape` - the global `errorFormatter`
hasn't run at this point, and won't run at all if this formatter returns
something.

On the client, the error for `sendMessage` is a union of everything the chain
can return plus the global shape, which you narrow like any other discriminated
union. Procedures built from a plain `t.procedure` keep the router-wide shape:

```tsx twoslash title='components/SendMessage.tsx'
// @jsx: react-jsx
// @filename: server.ts
import { initTRPC, TRPCError } from '@trpc/server';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

const t = initTRPC.create();

const rateLimitedProcedure = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  return undefined;
});

export const appRouter = t.router({
  sendMessage: rateLimitedProcedure.mutation(() => {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      cause: new RateLimitError(5_000),
    });
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: components/SendMessage.tsx
// ---cut---
import { trpc } from '../utils/trpc';

export function SendMessage() {
  const mutation = trpc.sendMessage.useMutation();

  const data = mutation.error?.data;
  if (data && 'kind' in data) {
    return <p>Rate limited - retry in {data.retryAfterMs}ms</p>;
  }

  return <button onClick={() => mutation.mutate()}>Send</button>;
}
```

### Chaining

`.errors()` is chainable, and formatters added to a base procedure are inherited
by every procedure built from it. Because the tail runs first, a procedure can
add a formatter that takes precedence over the ones it inherited:

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';

class RateLimitError extends Error {}
class PaymentRequiredError extends Error {
  constructor(public readonly amountDue: number) {
    super('Payment required');
  }
}

const t = initTRPC.create();

const rateLimitedProcedure = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: { ...opts.shape.data, kind: 'RATE_LIMIT' as const },
    };
  }
  return undefined;
});

// ---cut---
const billedProcedure = rateLimitedProcedure.errors((opts) => {
  if (opts.error.cause instanceof PaymentRequiredError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'PAYMENT_REQUIRED' as const,
        amountDue: opts.error.cause.amountDue,
      },
    };
  }
  return undefined;
});
```

A `PAYMENT_REQUIRED` error is handled by the new formatter, a `RATE_LIMIT` one
falls through to the inherited formatter, and anything else reaches the global
`errorFormatter`. The client-side error type for `billedProcedure` is the union
of all three.

### Formatters that always return

A formatter that can't return `undefined` handles every error, which makes
everything before it - including the router-wide `errorFormatter` - unreachable.
The types reflect that: the error union for such a procedure is exactly what
that formatter returns, with no global shape to narrow against.

:::info
Procedure-level formatters only run for errors that reach a resolved procedure -
that includes errors thrown by the procedure's own middlewares, input parsing and
output parsing. Request-level failures (a malformed body, a failing
`createContext()`, an unknown path) can't be attributed to a procedure, so only
the global `errorFormatter` applies to those.
:::

## All properties sent to `errorFormatter()`

> tRPC is compliant with [JSON-RPC 2.0](https://www.jsonrpc.org/specification)

```ts twoslash
import { TRPCError } from '@trpc/server';
// ---cut---
interface ErrorFormatterOpts {
  error: TRPCError;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: unknown;
  shape: { message: string; code: number; data: unknown };
}
```

**`DefaultErrorShape`:**

```ts twoslash
import type { TRPC_ERROR_CODE_KEY, TRPC_ERROR_CODE_NUMBER } from '@trpc/server';
// ---cut---
type DefaultErrorData = {
  code: TRPC_ERROR_CODE_KEY;
  httpStatus: number;
  /**
   * Path to the procedure that threw the error
   */
  path?: string;
  /**
   * Stack trace of the error (only in development)
   */
  stack?: string;
};

interface DefaultErrorShape {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
  data: DefaultErrorData;
}
```
