---
id: disabling-queries
title: Disabling Queries
sidebar_label: Disabling Queries
slug: /client/react/disabling-queries
---

To disable queries, you can pass `skipToken` as the first argument to `useQuery` or `useInfiniteQuery`. This will prevent the query from being executed.

### Typesafe conditional queries using `skipToken`

```tsx twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  getUserByName: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { name: input.name, email: 'user@example.com' };
    }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: component.tsx
// ---cut---
import React, { useState } from 'react';
import { skipToken } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

export function MyComponent() {
  const [name, setName] = useState<string | undefined>();

  const result = trpc.getUserByName.useQuery(name ? { name: name } : skipToken);

  return (
    <div>{result.data?.name}</div>
  );
}
```
