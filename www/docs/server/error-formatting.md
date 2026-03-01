---
id: error-formatting
title: Error Formatting
sidebar_label: Error Formatting
slug: /server/error-formatting
---

The error formatting in your router will be inferred all the way to your client

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

## All properties sent to `errorFormatter()`

> Since `v8.x` tRPC is compliant with [JSON-RPC 2.0](https://www.jsonrpc.org/specification)

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
