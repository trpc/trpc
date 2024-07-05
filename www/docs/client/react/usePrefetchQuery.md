---
id: usePrefetchQuery
title: usePrefetchQuery()
sidebar_label: usePrefetchQuery()
slug: /client/react/usePrefetchQuery
---

:::note
The hooks provided by `@trpc/react-query` are a thin wrapper around @tanstack/react-query. For in-depth information about options and usage patterns, refer to their docs on [queries](https://tanstack.com/query/v5/docs/framework/react/guides/queries).
:::

```tsx
function useQuery(
  input: TInput,
  opts?: TRPCFetchQueryOptions;
)

interface TRPCFetchQueryOptions
  extends FetchQueryOptions { }
```

Since `TRPCFetchQueryOptions` extends @tanstack/react-query's `FetchQueryOptions`, you can use any of their options here such as `enabled`, `refetchOnWindowFocus`, etc.

:::tip
If you need to set any options but don't want to pass any input, you can pass `undefined` instead.
:::

You'll notice that you get autocompletion on the `input` based on what you have set in your `input` schema on your backend.

### Example

<details><summary>Backend code</summary>

```tsx title='server/routers/_app.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  // Create procedure at path 'hello'
  hello: t.procedure
    // using zod schema to validate and infer input values
    .input(
      z
        .object({
          text: z.string().nullish(),
        })
        .nullish(),
    )
    .query((opts) => {
      return {
        greeting: `hello ${opts.input?.text ?? 'world'}`,
      };
    }),
});
```

</details>

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

function SuspendingComponent() {
  // The query is already prefetched
  const helloSuspense = trpc.hello.useSuspenceQuery();
  return <div>SuspendingComponent: {hello.data}</div>;
}

export function MyComponent() {
  // This will prefetch the query before the suspense component is rendered
  trpc.hello.usePrefetchQuery();

  return (
    <div>
      <h1>Prefetching query example</h1>
      <Suspence>
        <SuspendingComponent />
      </Suspence>
    </div>
  );
}
```
