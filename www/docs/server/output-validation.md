---
id: output-validation
title: Output Validation
sidebar_label: Output Validation
slug: /server/output-validation
---

tRPC gives you automatic type-safety of outputs without the need of adding a validator; however, it can be useful at times to strictly define the output type in order to prevent sensitive data from being leaked.

Similarly to [`input`](routers), an `output` validator can be added. The output validator is invoked with your payload.

When an `output` validator is defined, its inferred type is expected as the return type of your resolver (like `t.procedure.query()`).

:::info

- This is entirely optional and only if you want to validate your output at runtime. This can be useful to ensure you do not accidentally leak any unexpected data.
- If output validation fails, the server will respond with an `INTERNAL_SERVER_ERROR`.

:::

## Examples

tRPC works out-of-the-box with yup/superstruct/zod/myzod/custom validators/[..] - [see test suite](https://github.com/trpc/trpc/blob/feature/output-parser-oas/packages/server/test/outputParser.test.ts)

### With [Zod](https://github.com/colinhacks/zod)

```tsx
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .output(
      z.object({
        greeting: z.string(),
      }),
    )
    // expects return type of { greeting: string }
    .query(() => {
      return {
        greeting: 'hello',
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [Yup](https://github.com/jquense/yup)

```tsx
import { initTRPC } from '@trpc/server';
import * as yup from 'yup';

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .output(
      yup.object({
        greeting: yup.string().required(),
      }),
    )
    .query(() => {
      return {
        greeting: 'hello',
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [Superstruct](https://github.com/ianstormtaylor/superstruct)

```tsx
import { initTRPC } from '@trpc/server';
import { object, string } from 'superstruct';

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input(string())
    .output(object({ greeting: string() }))
    .query(({ input }) => {
      return {
        greeting: input,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With custom validator

```tsx
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .output((value: any) => {
      if (value && typeof value.greeting === 'string') {
        return { greeting: value.greeting };
      }
      throw new Error('Greeting not found');
    })
    // expects return type of { greeting: string }
    .query(() => {
      return {
        greeting: 'hello',
      };
    }),
});

export type AppRouter = typeof appRouter;
```
