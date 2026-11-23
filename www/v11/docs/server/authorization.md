---
id: authorization
title: Authorization
sidebar_label: Authorization
slug: /server/authorization
section: "Backend Usage"
order: 20
skill:
  name: auth
  package: "@trpc/server"
  type: composition
  requires:
    - server-setup
    - middlewares
    - client-setup
  description: Implement JWT/cookie authentication and authorization in tRPC using
    createContext for user extraction, t.middleware with opts.next({ ctx }) for
    context narrowing to non-null user, protectedProcedure base pattern,
    client-side Authorization headers via httpBatchLink headers(), WebSocket
    connectionParams, and SSE auth via cookies or EventSource polyfill custom
    headers. UNAUTHORIZED vs FORBIDDEN, role checks stacked on
    protectedProcedure, and why createContext shouldn't throw for a bad token.
  include:
    - client/headers
    - client/links/httpSubscriptionLink#headers-and-authorization--authentication
    - server/websockets#connectionParams
  references:
    - client/cors
---

The `createContext` function is called for each incoming request, so here you can add contextual information about the calling user from the request object.

## Create context from request headers

```ts twoslash title='server/context.ts'
// @filename: utils.ts
export async function decodeAndVerifyJwtToken(token: string) {
  return { name: 'user' };
}

// @filename: context.ts
// ---cut---
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { decodeAndVerifyJwtToken } from './utils';

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

## Building on a protected procedure

Since a procedure's middlewares run in order, you can add more checks on top of `protectedProcedure`, where `ctx.user` is already non-null:

```ts twoslash title='server/trpc.ts'
import { initTRPC, TRPCError } from '@trpc/server';

type Context = { user: { name: string; role: 'admin' | 'user' } | null };

export const t = initTRPC.context<Context>().create();

export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const adminProcedure = protectedProcedure.use(async (opts) => {
  if (opts.ctx.user.role !== 'admin') {
    //           ^?
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return opts.next();
});
```

Throw `UNAUTHORIZED` (401) when the caller isn't signed in, and `FORBIDDEN` (403) when they are, but aren't allowed to do this.

## Sending credentials from the client

- **Cookies** are sent with every request when the client and server are on the same origin. For another origin, see [CORS & Cookies](../client/cors.md).
- **Headers** like `Authorization` can be set on any HTTP link with the [`headers`](../client/headers.md) option.
- **Subscriptions** over SSE can't send custom headers with the browser's `EventSource`. See [`httpSubscriptionLink`](../client/links/httpSubscriptionLink.md#headers-and-authorization--authentication) for the options.
- **WebSockets** send [connection params](./websockets.md#connectionParams) when the connection opens, which `createContext` reads from `opts.info.connectionParams`.

## Common mistakes

- **Calling `opts.next()` without the narrowed `ctx`.** Procedures after the middleware still see `ctx.user` as nullable. Pass `opts.next({ ctx: { user: opts.ctx.user } })`, as in [Option 2](#option-2-authorize-using-middleware).
- **Throwing in `createContext` for a missing or invalid token.** That fails every procedure in the request, public ones too. Return `user: null` instead, and let a middleware reject the procedures that need a user.
- **Putting tokens in `httpSubscriptionLink`'s `connectionParams`.** They are sent in the URL, where servers and proxies may log them. Prefer cookies, or headers through an `EventSource` ponyfill.
