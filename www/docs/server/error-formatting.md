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

Errors can be formatted on a per-procedure basis using the `.errors()` method, which can be chained to produce a union of possible error shapes for each procedure.

When a middleware or procedure throws an error, it bubbles upward through all `.errors()` handlers until one returns a shape or the global errorFormatter is reached.

Bubbling starts at the **tail** of the chain, so the handler you chained last gets first refusal. A handler that always returns a shape makes everything before it unreachable, including the global `errorFormatter`, and the procedure's error type narrows to just that shape.

Only the order of `.errors()` handlers relative to each other matters. Where you chain them relative to `.use()` doesn't - a handler catches anything the procedure throws, including from middlewares added before it.

```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';

class RateLimitError extends Error {}
class PaymentRequiredError extends Error {
  constructor(public readonly amountDue: number) {
    super('Payment required');
  }
}

const t = initTRPC.create();
declare function isRateLimited(opts: any): boolean;
declare function isPaymentRequired(opts: any): boolean;

// ---cut---
const rateLimitedProcedure = t.procedure
  .errors((opts) => {
    if (opts.error.cause instanceof RateLimitError) {
      return {
        ...opts.shape,
        data: { ...opts.shape.data, kind: 'RATE_LIMIT' as const },
      };
    }
    return undefined;
  })
  .use(opts => {
    if (isRateLimited(opts)) {
      throw new RateLimitError();
    }

    return opts.next();
  });

const billedProcedure = rateLimitedProcedure
  .errors((opts) => {
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

const addPostProcedure = billedProcedure.mutation(opts => {
  if (isPaymentRequired(opts)) {
    throw new PaymentRequiredError(100);
  }

  return {
    success: true,
  };
});
```

:::info
`.errors()` handlers only see errors that reach a resolved procedure, which includes errors from its own middlewares and input/output parsing. Request-level failures - a malformed body, a failing `createContext()`, an unknown path - aren't attributable to a single procedure (a batched request may hold several), so those always go to the global `errorFormatter`.
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
