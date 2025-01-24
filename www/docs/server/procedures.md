---
id: procedures
title: Define Procedures
sidebar_label: Define Procedures
slug: /server/procedures
---

A procedure is a function which is exposed to the client, it can be one of:

- a `Query` - used to fetch data, generally does not change any data
- a `Mutation` - used to send data, often for create/update/delete purposes
- a `Subscription` - you might not need this, and we have [dedicated documentation](../server/subscriptions.md)

Procedures in tRPC are very flexible primitives to create backend functions. They use an immutable builder pattern, which means you can [create reusable base procedures](#reusable-base-procedures) that share functionality among multiple procedures.

## Writing procedures

The `t` object you create during tRPC setup returns an initial `t.procedure` which all other procedures are built on:

```ts twoslash
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.context<{ signGuestBook: () => Promise<void> }>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const appRouter = router({
  // Queries are the best place to fetch data
  hello: publicProcedure.query(() => {
    return {
      message: 'hello world',
    };
  }),

  // Mutations are the best place to do things like updating a database
  goodbye: publicProcedure.mutation(async (opts) => {
    await opts.ctx.signGuestBook();

    return {
      message: 'goodbye!',
    };
  }),
});
```

## Reusable "Base Procedures" {#reusable-base-procedures}

As a general pattern we recommend you rename and export `t.procedure` as `publicProcedure`, which then makes room for you to create other named procedures for specific use cases and export those too. This pattern is called "base procedures" and is a key pattern for code and behaviour re-use in tRPC; every application is likely to need it.

In the below code, we're using reusable base procedures to build common use-cases for our app - we're making a reusable base procedures for logged in users (`authedProcedure`) & another base procedure that takes an `organizationId` and validates that a user is part of that organization.

> This is a simplified example; in practice you may want to use some combination of [Headers](/docs/client/headers), [Context](context), [Middleware](middlewares), and [Metadata](metadata), to [authenticate](https://en.wikipedia.org/wiki/Authentication) and [authorize](authorization) your users.

```ts twoslash
// @target: esnext
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

type Organization = {
  id: string;
  name: string;
};
type Membership = {
  role: 'ADMIN' | 'MEMBER';
  Organization: Organization;
};
type User = {
  id: string;
  memberships: Membership[];
};
type Context = {
  /**
   * User is nullable
   */
  user: User | null;
};

const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure;

// procedure that asserts that the user is logged in
export const authedProcedure = t.procedure.use(async function isAuthed(opts) {
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
    },
  });
});

// procedure that a user is a member of a specific organization
export const organizationProcedure = authedProcedure
  .input(z.object({ organizationId: z.string() }))
  .use(function isMemberOfOrganization(opts) {
    const membership = opts.ctx.user.memberships.find(
      (m) => m.Organization.id === opts.input.organizationId,
    );
    if (!membership) {
      throw new TRPCError({
        code: 'FORBIDDEN',
      });
    }
    return opts.next({
      ctx: {
        Organization: membership.Organization,
      },
    });
  });

export const appRouter = t.router({
  whoami: authedProcedure.mutation(async (opts) => {
    // user is non-nullable here
    const { ctx } = opts;
    //      ^?
    return ctx.user;
  }),
  addMember: organizationProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation((opts) => {
      // ctx contains the non-nullable user & the organization being queried
      const { ctx } = opts;
      //       ^?

      // input includes the validate email of the user being invited & the validated organizationId
      const { input } = opts;
      //       ^?

      return '...';
    }),
});
```

## Inferring the options type of a "Base Procedure" {#inferProcedureBuilderResolverOptions}

In addition to being able to [infer the input and output types](/docs/client/vanilla/infer-types#inferring-input--output-types) of a procedure, you can also infer the options type of a specific procedure builder (or base procedure) using `inferProcedureBuilderResolverOptions`.

This type helper is useful for declaring a type to a function's parameters. Like for example, separating the procedure's handler (main execution code) from its definition at the router, or for creating a helper function that works with multiple procedures.

```ts twoslash
// @target: esnext
// ---cut---
import {
  inferProcedureBuilderResolverOptions,
  initTRPC,
  TRPCError,
} from '@trpc/server';
import { z } from 'zod';

type Organization = {
  id: string;
  name: string;
};
type Membership = {
  role: 'ADMIN' | 'MEMBER';
  Organization: Organization;
};
type User = {
  id: string;
  memberships: Membership[];
};
type Context = {
  /**
   * User is nullable
   */
  user: User | null;
};

const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure;

// procedure that asserts that the user is logged in
export const authedProcedure = t.procedure.use(async function isAuthed(opts) {
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
    },
  });
});
// mock prisma
let prisma = {} as any;

// procedure that a user is a member of a specific organization
export const organizationProcedure = authedProcedure
  .input(z.object({ organizationId: z.string() }))
  .use(function isMemberOfOrganization(opts) {
    const membership = opts.ctx.user.memberships.find(
      (m) => m.Organization.id === opts.input.organizationId,
    );
    if (!membership) {
      throw new TRPCError({
        code: 'FORBIDDEN',
      });
    }
    return opts.next({
      ctx: {
        Organization: membership.Organization,
      },
    });
  });

// ---cut---
async function getMembersOfOrganization(
  opts: inferProcedureBuilderResolverOptions<typeof organizationProcedure>,
) {
  // input and ctx are now correctly typed!
  const { ctx, input } = opts;

  return await prisma.user.findMany({
    where: {
      membership: {
        organizationId: ctx.Organization.id,
      },
    },
  });
}
export const appRouter = t.router({
  listMembers: organizationProcedure.query(async (opts) => {
    // use helper function!
    const members = await getMembersOfOrganization(opts);

    return members;
  }),
});
```

## Subscriptions

For information on subscriptions, see [our subscriptions guide](../server/subscriptions.md).
