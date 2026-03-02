---
id: authorization
title: Authorization
sidebar_label: Authorization
slug: /server/authorization
---

The `createContext` function is called for each incoming request, so here you can add contextual information about the calling user from the request object.

## Create context from request headers

```ts twoslash title='server/context.ts'
// @filename: context.ts
// ---cut---
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { decodeAndVerifyJwtToken } from './utils';

// @filename: utils.ts
export async function decodeAndVerifyJwtToken(token: string) {
  return { name: 'user' };
}

export async function createContext({ req, res }: CreateHTTPContextOptions) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  // This is just an example of something you might want to do in your ctx fn
  async function getUserFromHeader() {
    if (req.headers.authorization) {
      const user = await decodeAndVerifyJwtToken(
        req.headers.authorization.split(' ')[1],
      );
      return user;
    }
    return null;
  }
  const user = await getUserFromHeader();

  return {
    user,
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
```

## Option 1: Authorize using resolver

```ts twoslash title='server/routers/_app.ts'
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

type Context = { user: { name: string } | null };

export const t = initTRPC.context<Context>().create();

const appRouter = t.router({
  // open for anyone
  hello: t.procedure
    .input(z.string().nullish())
    .query((opts) => `hello ${opts.input ?? opts.ctx.user?.name ?? 'world'}`),
  // checked in resolver
  secret: t.procedure.query((opts) => {
    if (!opts.ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return {
      secret: 'sauce',
    };
  }),
});
```

## Option 2: Authorize using middleware

```ts twoslash title='server/routers/_app.ts'
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

type Context = { user: { name: string } | null };

export const t = initTRPC.context<Context>().create();

// you can reuse this for any procedure
export const protectedProcedure = t.procedure.use(
  async function isAuthed(opts) {
    const { ctx } = opts;
    // `ctx.user` is nullable
    if (!ctx.user) {
      //     ^?
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return opts.next({
      ctx: {
        // ✅ user value is known to be non-null now
        user: ctx.user,
        // ^?
      },
    });
  },
);

t.router({
  // this is accessible for everyone
  hello: t.procedure
    .input(z.string().nullish())
    .query((opts) => `hello ${opts.input ?? opts.ctx.user?.name ?? 'world'}`),
  admin: t.router({
    // this is accessible only to admins
    secret: protectedProcedure.query((opts) => {
      return {
        secret: 'sauce',
      };
    }),
  }),
});
```
