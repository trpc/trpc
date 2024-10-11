---
id: useQuery
title: useQuery()
sidebar_label: useQuery()
slug: /client/react/useQuery
---

`useQuery` is the primary hook for data fetching, it works similarly to `@tanstack/react-query`'s `useQuery`, but with some `trpc` specific options and additional features like streaming.

:::note
For in-depth information about options and usage patterns, refer to the Tanstack Query docs on [queries](https://tanstack.com/query/v5/docs/framework/react/guides/queries).
:::

## Signature

```tsx
function useQuery(
  input: TInput | SkipToken,
  opts?: UseTRPCQueryOptions;
)

interface UseTRPCQueryOptions
  extends UseQueryOptions {
  trpc: {
    ssr?: boolean;
    abortOnUnmount?: boolean;
    context?: Record<string, unknown>;
  }
}
```

Since `UseTRPCQueryOptions` extends `@tanstack/react-query`'s `UseQueryOptions`, you can use any of their options here such as `enabled`, `refetchOnWindowFocus`, etc. We also have some `trpc` specific options that let you opt in or out of certain behaviors on a per-procedure level:

- **`trpc.ssr`:** If you have `ssr: true` in your [global config](/docs/client/nextjs/setup#ssr-boolean-default-false), you can set this to false to disable ssr for this particular query. _Note that this does not work the other way around, i.e., you can not enable ssr on a procedure if your global config is set to false._
- **`trpc.abortOnUnmount`:** Override the [global config](/docs/client/nextjs/setup#config-callback) and opt in or out of aborting queries on unmount.
- **`trpc.context`:** Add extra meta data that could be used in [Links](/docs/client/links).

:::tip
If you need to set any options but don't want to pass any input, you can pass `undefined` instead.
:::

You'll notice that you get autocompletion on the `input` based on what you have set in your `input` schema on your backend.

## Example usage

<details>
<summary>Backend code</summary>

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

export function MyComponent() {
  // input is optional, so we don't have to pass second argument
  const helloNoArgs = trpc.hello.useQuery();
  const helloWithArgs = trpc.hello.useQuery({ text: 'client' });

  return (
    <div>
      <h1>Hello World Example</h1>
      <ul>
        <li>
          helloNoArgs ({helloNoArgs.status}):{' '}
          <pre>{JSON.stringify(helloNoArgs.data, null, 2)}</pre>
        </li>
        <li>
          helloWithArgs ({helloWithArgs.status}):{' '}
          <pre>{JSON.stringify(helloWithArgs.data, null, 2)}</pre>
        </li>
      </ul>
    </div>
  );
}
```

## Streaming responses using async generators {#streaming}

:::info
Since v11 we now support streaming queries when using the [`httpBatchStreamLink`](../links/httpBatchStreamLink.md#generators).
:::

When returning an async generators in a query, you will:

- Get the results of the iterator in the `data`-property **as an array** which updates as the response comes in
- The `status` will be `success` as soon as the first chunk is received.
- The `fetchStatus` property which will be `fetching` until the last chunk is received.

### Example

```tsx title='server/routers/_app.ts'
import { publicProcedure, router } from './trpc';

const appRouter = router({
  iterable: publicProcedure.query(async function* () {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      yield i;
    }
  }),
});

export type AppRouter = typeof appRouter;
```

```tsx title='components/MyComponent.tsx'
import { trpc } from '~/utils';

export function MyComponent() {
  const result = trpc.iterable.useQuery();

  return (
    <div>
      {result.data?.map((chunk, index) => (
        <Fragment key={index}>{chunk}</Fragment>
      ))}
    </div>
  );
}
```

`result` properties while streaming:

| `status`    | `fetchStatus` | `data`      |
| ----------- | ------------- | ----------- |
| `'pending'` | `'fetching'`  | `undefined` |
| `'success'` | `'fetching'`  | `[]`        |
| `'success'` | `'fetching'`  | `[1]`       |
| `'success'` | `'fetching'`  | `[1, 2]`    |
| `'success'` | `'fetching'`  | `[1, 2, 3]` |
| `'success'` | `'idle'`      | `[1, 2, 3]` |
