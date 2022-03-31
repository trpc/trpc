---
id: output-validation
title: Output Validation
sidebar_label: Output Validation
slug: /output-validation
---

You are able to add an output validation to the `query()` and `mutation()` router methods. The output validator is invoked with the payload returned by the `resolve()` function.

When an `output` validator is defined, its inferred type is expected as the return type of the `resolve()` function.

:::info

- If output validation fails, the server will respond with a `INTERNAL_SERVER_ERROR`.
- Output validation can be skipped by setting the environment variable: `TRPC_SKIP_OUTPUT_VALIDATION=true`

:::

## Examples

tRPC works out-of-the-box with yup/superstruct/zod/myzod/custom validators/[..] - [see test suite](https://github.com/trpc/trpc/blob/feature/output-parser-oas/packages/server/test/outputParser.test.ts)

### With [Zod](https://github.com/colinhacks/zod)

```tsx
import * as trpc from '@trpc/server';
import { z } from 'zod';

// [...]

export const appRouter = trpc.router<Context>().query('hello', {
  output: z.object({
    greeting: z.string(),
  }),
  // expects return type of { greeting: string }
  resolve() {
    return {
      greeting: 'hello!',
    };
  },
});

export type AppRouter = typeof appRouter;
```

### With [Yup](https://github.com/jquense/yup)

```tsx
import * as trpc from '@trpc/server';
import * as yup from 'yup';

// [...]

export const appRouter = trpc.router<Context>().query('hello', {
  output: yup.object({
    greeting: yup.string().required(),
  }),
  resolve() {
    return { greeting: 'hello!' };
  },
});

export type AppRouter = typeof appRouter;
```

### With [Superstruct](https://github.com/ianstormtaylor/superstruct)

```tsx
import * as trpc from '@trpc/server';
import * as t from 'superstruct';

// [...]

export const appRouter = trpc.router<Context>().query('hello', {
  input: t.string(),
  output: t.object({
    greeting: t.string(),
  }),
  resolve({ input }) {
    return { greeting: input };
  },
});

export type AppRouter = typeof appRouter;
```

### With custom validator

```tsx
import * as trpc from '@trpc/server';
import * as t from 'superstruct';

// [...]

export const appRouter = trpc.router<Context>().query('hello', {
  output: (value: any) => {
    if (value && typeof value.greeting === 'string') {
      return { greeting: value.greeting };
    }
    throw new Error('Greeting not found');
  },
  // expects return type of { greeting: string }
  resolve() {
    return { greeting: 'hello!' };
  },
});

export type AppRouter = typeof appRouter;
```
