---
id: context
title: Request Context
sidebar_label: Request Context
slug: /context
---

The `createContext()` function is called for each request and the result is propagated to all resolvers. You can use this to pass contextual data down to the resolvers.

## Example code


```tsx twoslash
// -------------------------------------------------
// @filename: context.ts
// -------------------------------------------------
import { inferAsyncReturnType } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { getSession } from 'next-auth/react';

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export async function createContext(opts: trpcNext.CreateNextContextOptions) {
  const session = await getSession({ req: opts.req });
  
  return {
    session,
  };
};

export type Context = inferAsyncReturnType<typeof createContext>;

// -------------------------------------------------
// @filename: trpc.ts
// -------------------------------------------------
import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';

const t = initTRPC.context<Context>().create();


const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.session?.user?.email) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }
  return next({
    ctx: {
      // Infers the `session` as non-nullable
      session: ctx.session,
    },
  });
});

export const middleware = t.middleware;
export const router = t.router;

/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure;

/**
 * Protected procedure
 **/
export const protectedProcedure = t.procedure.use(isAuthed);

// -------------------------------------------------
// @filename: [trpc].ts
// -------------------------------------------------
import * as trpcNext from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers/_app';
import { createContext } from '../../../server/context';

export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: createContext,
});

```
