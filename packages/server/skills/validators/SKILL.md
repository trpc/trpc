---
name: validators
description: >
  Configure input and output validation with .input() and .output() using Zod,
  Yup, Superstruct, ArkType, Valibot, Effect, or custom validator functions.
  Chain multiple .input() calls to merge object schemas. Standard Schema protocol
  support. Output validation returns INTERNAL_SERVER_ERROR on failure.
type: core
library: trpc
library_version: '11.14.0'
requires:
  - server-setup
sources:
  - 'trpc/trpc:www/docs/server/validators.md'
  - 'trpc/trpc:packages/server/src/unstable-core-do-not-import/parser.ts'
---

# tRPC -- Validators

## Setup

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts
// server/appRouter.ts
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => {
      return { greeting: `hello ${input.name}` };
    }),
});

export type AppRouter = typeof appRouter;
```

## Core Patterns

### Input validation with Zod

```ts
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  userById: publicProcedure.input(z.string()).query(({ input }) => {
    return { id: input, name: 'Katt' };
  }),
  userCreate: publicProcedure
    .input(z.object({ name: z.string(), email: z.string().email() }))
    .mutation(({ input }) => {
      return { id: '1', ...input };
    }),
});
```

### Input chaining to merge object schemas

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const baseProcedure = t.procedure
  .input(z.object({ townName: z.string() }))
  .use((opts) => {
    console.log(`Request from: ${opts.input.townName}`);
    return opts.next();
  });

export const appRouter = t.router({
  hello: baseProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello ${input.name}, from ${input.townName}` };
    }),
});
```

Multiple `.input()` calls merge object properties; the final input type is `{ townName: string; name: string }`.

### Output validation

```ts
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  hello: publicProcedure
    .output(z.object({ greeting: z.string() }))
    .query(() => {
      return { greeting: 'hello world' };
    }),
});
```

Output validation catches mismatches between your return type and the expected shape, useful for untrusted data sources.

### Custom validator function (no library)

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input((value): string => {
      if (typeof value === 'string') return value;
      throw new Error('Input is not a string');
    })
    .output((value): string => {
      if (typeof value === 'string') return value;
      throw new Error('Output is not a string');
    })
    .query(({ input }) => {
      return `hello ${input}`;
    }),
});
```

## Common Mistakes

### [MEDIUM] Chaining non-object inputs

Wrong:

```ts
import { z } from 'zod';
import { publicProcedure } from './trpc';

const proc = publicProcedure.input(z.string()).input(z.number());
```

Correct:

```ts
import { z } from 'zod';
import { publicProcedure } from './trpc';

const proc = publicProcedure
  .input(z.object({ name: z.string() }))
  .input(z.object({ age: z.number() }));
```

Multiple `.input()` calls merge object properties; non-object schemas (string, number, array) cannot be merged and produce type errors.

Source: www/docs/server/validators.md

### [MEDIUM] Output validation failure returns 500

Wrong:

```ts
import { z } from 'zod';
import { publicProcedure } from './trpc';

const proc = publicProcedure
  .output(z.object({ id: z.string() }))
  .query(() => ({ id: 123 }));
```

Correct:

```ts
import { z } from 'zod';
import { publicProcedure } from './trpc';

const proc = publicProcedure
  .output(z.object({ id: z.string() }))
  .query(() => ({ id: '123' }));
```

If `.output()` validation fails, tRPC returns INTERNAL_SERVER_ERROR (500), not BAD_REQUEST, because the server produced invalid data.

Source: www/docs/server/validators.md

### [HIGH] Using cursor: z.optional() without nullable for infinite queries

Wrong:

```ts
import { z } from 'zod';
import { publicProcedure } from './trpc';

const proc = publicProcedure
  .input(z.object({ cursor: z.string().optional() }))
  .query(({ input }) => {
    return { items: [], nextCursor: input.cursor };
  });
```

Correct:

```ts
import { z } from 'zod';
import { publicProcedure } from './trpc';

const proc = publicProcedure
  .input(z.object({ cursor: z.string().nullish() }))
  .query(({ input }) => {
    return { items: [], nextCursor: input.cursor };
  });
```

React Query internally passes `cursor: undefined` during invalidation refetch; using `.optional()` without `.nullable()` can fail validation. Use `.nullish()` instead.

Source: https://github.com/trpc/trpc/issues/6862

## See Also

- `server-setup` -- initTRPC, routers, procedures
- `error-handling` -- how validation errors surface as BAD_REQUEST
- `error-handling` -- errorFormatter to expose Zod field errors
- `middlewares` -- use input chaining with middleware base procedures
