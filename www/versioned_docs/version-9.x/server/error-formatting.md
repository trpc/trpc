---
id: error-formatting
title: Error Formatting
sidebar_label: Error Formatting
slug: /error-formatting
---

The error formatting in your router will be inferred all the way to your client (&&nbsp;React&nbsp;components)

## Usage example highlighted

### Adding custom formatting

```ts title='server.ts'
const router = trpc.router<Context>().formatError(({ shape, error }) => {
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
});
```

### Usage in React

```tsx title='components/MyComponent.tsx'
export function MyComponent() {
  const mutation = trpc.useMutation('addPost');

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

## All properties sent to `formatError()`

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
