---
id: error-formatting
title: Error Formatting
sidebar_label: Error Formatting
slug: /server/error-formatting
---

The error formatting in your router will be inferred all the way to your client (&&nbsp;React&nbsp;components)

## Usage example: Zod validation error

### Server-side

```ts title='server.ts'
import { initTRPC } from '@trpc/server';

export const t = initTRPC.context<Context>().create({
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

```tsx title='components/MyComponent.tsx'
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

## Usage example: Prisma conflict

In this one we even change http status code of the response from 500 to 409

### Serverside

```ts title='server.ts'
import { initTRPC } from '@trpc/server';
import { Prisma } from '@prisma/client'

export const t = initTRPC.context<Context>().create({
  errorFormatter(opts) {
    const { shape, error } = opts;
      const prismaError = error.cause as Prisma.PrismaClientKnownRequestError;
      if (prismaError && prismaError.code === 'P2002' && prismaError.meta) {
        // https://www.prisma.io/docs/reference/api-reference/error-reference#p2002
        return {
          error,
          ...shape,
          data: {
            ...shape.data,
            httpStatus: 409
          },
          code: 409,
          message: `Operation ${shape.data.path} failed: same value already exists for field "${prismaError.meta.target}"`
        };
      }

      // rest of your formatter for all other cases
  },
});
```


## All properties sent to `errorFormatter()`

> Since `v8.x` tRPC is compliant with [JSON-RPC 2.0](https://www.jsonrpc.org/specification)

```ts
{
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | TContext;
  shape: DefaultErrorShape; // the default error shape
}
```

**`DefaultErrorShape`:**

```ts
interface DefaultErrorData {
  code: TRPC_ERROR_CODE_KEY;
  httpStatus: number;
  path?: string;
  stack?: string;
}

interface DefaultErrorShape
  extends TRPCErrorShape<TRPC_ERROR_CODE_NUMBER, DefaultErrorData> {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
}
```
