---
id: queries
title: useQuery()
sidebar_label: useQuery()
slug: /react-queries
---

> The hooks provided by `@trpc/react` are a thin wrapper around React Query. For in-depth information about options and usage patterns, refer to their docs on [Queries](https://react-query.tanstack.com/guides/queries).

```tsx
function useQuery(
  pathAndInput: [string, TInput?],
  opts?: UseTRPCQueryOptions;
)
```

The first argument is a `[path, input]`-tuple - if the `input` is optional, you can omit the `, input`-part.

You'll notice that you get autocompletion on the `path` and automatic typesafety on the `input`.

### Example

<details><summary>Backend code</summary>

```tsx title='server/routers/_app.ts'
import { initTRPC } from '@trpc/server'
import { z } from 'zod';

export const t = initTRPC.create()

export const appRouter = t.router({
  // Create procedure at path 'hello'
  hello: t
    .procedure
    // using zod schema to validate and infer input values
    .input(
      z.object({
        text: z.string().nullish(),
      })
      .nullish() 
    )
    .query(({ input }) => {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    })
})
```

</details>

```tsx  title='components/MyComponent.tsx'
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
