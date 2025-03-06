---
id: authorization
title: Authorization
sidebar_label: Authorization
slug: /server/authorization
---

The `createContext` function is called for each incoming request, so here you can add contextual information about the calling user from the request object.

## Create context from request headers

<!-- prettier-ignore-start -->
```ts twoslash title='server/context.ts'
// @filename: /server/somewhere/in/your/app/utils.ts
interface Session {}
export declare function getSession(request: Request): Session | null
// @filename: server/context.ts
// ---cut---
import {
  getSession // Example function
} from './somewhere/in/your/app/utils';
import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export async function createContext(opts: FetchCreateContextFnOptions) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  const session = await getSession(opts.req);
  //                     ^?


  return {
    ...opts,
    session,
    // ^?
  };
}

// This context will be available as `ctx` in all your resolvers
export type Context = Awaited<ReturnType<typeof createContext>>;
//           ^?
```
<!-- prettier-ignore-end -->

## Authorize using a base procedure (recommended) {#base-procedure}

<!-- prettier-ignore-start -->
```ts twoslash title='server/trpc.ts'
// @filename: /server/somewhere/in/your/app/utils.ts
interface Session {}
export declare function getSession(request: Request): Session | null
// @filename: server/context.ts

import {
  getSession // Example function
} from './somewhere/in/your/app/utils';
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export async function createContext(opts: FetchCreateContextFnOptions) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  const session = await getSession(opts.req);


  return {
    ...opts,
    session,
  };
}

// This context will be available as `ctx` in all your resolvers
export type Context = Awaited<ReturnType<typeof createContext>>;

// @filename: server/trpc.ts
// ---cut---

import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;


// you can reuse this for any procedure
export const protectedProcedure = publicProcedure.use(
  async function isAuthed(opts) {
    const { session } = opts.ctx
    //         ^?
    // `session` is nullable
    if (!session) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }


    return opts.next({
      ctx: {
        // ✅ session value is known to be non-null now
        session,
        // ^?
      },
    });
  },
);

/// ....... ✨ usage in a procedure
// @filename: server/routers/post.ts
import { publicProcedure, protectedProcedure, router } from '../trpc'
import { z } from 'zod';

export const postRouter = router({
  add: protectedProcedure.mutation(async (opts) => {
    // ✨ session is non-nullable now
    opts.ctx.session;
    //        ^?
    // [...]
  }),

})

```
<!-- prettier-ignore-end -->

## Authorize in a resolver resolver

```ts title='server/routers/_app.ts'
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from '../context';

export const t = initTRPC.context<Context>().create();

const appRouter = t.router({
  // open for anyone
  hello: t.procedure
    .input(z.string().nullish())
    .query(
      (opts) =>
        `hello ${opts.input ?? opts.ctx.session?.user?.name ?? 'world'}`,
    ),
  // checked in resolver
  secret: t.procedure.query((opts) => {
    if (!opts.ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return {
      secret: 'sauce',
    };
  }),
});
```
