---
id: error-formatting
title: Error Formatting
sidebar_label: Error Formatting
slug: /error-formatting
---

You can do custom error formatting in your router and the returned object will be inferred all the way to your client (& React components)

## Adding custom formatting

```ts

const router = trpc.router<Context>()
  .formatError(({ defaultShape, error }) => {
    return {
      ...defaultShape,
      zodError:
        error.code === 'BAD_USER_INPUT' &&
        error.originalError instanceof ZodError
          ? error.originalError.flatten()
          : null,
    };
  })
```

## All properties sent to `formatError()`

```ts
{
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | TContext;
  defaultShape: DefaultErrorShape; // the default error shape
}
```

**`DefaultErrorShape`:**

```ts
export type DefaultErrorShape = {
  message: string;
  code: string;
  path?: string;
  stack?: string; // will be set if `process.env.NODE_ENV !== 'production'`
};
```

## Usage in React

```tsx

function MyComponent() {
  const mutation = hooks.useMutation('addPost');

  useEffect(() => {
    mutation.mutate({ title: 123 as any });
  }, []);

  if (mutation.error?.shape?.zodError) {
    // zodError will be inferred
    return (
      <pre>Error: {JSON.stringify(mutation.error.shape.zodError, null, 2)}</pre>
    );
  }
  return <>[...]</>;
}
```
