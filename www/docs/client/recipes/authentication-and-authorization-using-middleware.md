---
title: Authentication and Authorization using middleware
sidebar_label: Auth & authorization with middleware
---

The recommended pattern is to create reusable base procedures:

- `publicProcedure`: no auth requirement
- `authedProcedure`: user must be signed in
- `adminProcedure` (or role/scoped procedures): user must satisfy authorization checks

This keeps auth logic centralized and composable instead of repeated in every procedure.

```ts twoslash
import { TRPCError, initTRPC } from '@trpc/server';

type Context = {
  user?: {
    id: string;
    role: 'user' | 'admin';
  };
};

const t = initTRPC.context<Context>().create();
const publicProcedure = t.procedure;
const router = t.router;

const authedProcedure = publicProcedure.use((opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return opts.next({
    ctx: {
      user: opts.ctx.user,
    },
  });
});

const adminProcedure = authedProcedure.use((opts) => {
  if (opts.ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return opts.next();
});

export const appRouter = router({
  me: authedProcedure.query(({ ctx }) => ctx.user.id),
  adminSecret: adminProcedure.query(() => 'classified'),
});
```

Read more about middleware composition in [Middlewares](/docs/server/middlewares) and [Authorization](/docs/server/authorization).

## Authn vs authz in tRPC

- **Authentication** answers: "Who is this caller?"
  - usually implemented in `createContext` by decoding session/token/cookie
- **Authorization** answers: "What is this caller allowed to do?"
  - usually implemented in middleware by checking role/scope/ownership

Keep these concerns separate for clearer auditing and testing.

## Recommended scaling pattern

As your app grows, define more scoped base procedures, for example:

- `organizationMemberProcedure`
- `billingAdminProcedure`
- `featureFlaggedProcedure`

Compose from `publicProcedure` upward so each procedure layer expresses one policy.

## Production guidance

- Avoid DB lookups in every middleware call if data can be cached in context safely.
- Return explicit `TRPCError` codes (`UNAUTHORIZED`, `FORBIDDEN`) for consistent client behavior.
- Add structured logs on policy failures for security visibility.
- Write tests for both allowed and denied paths on each protected procedure family.

## Related references

- [Middlewares](../../server/middlewares.md)
- [Authorization](../../server/authorization.md)
- [Context](../../server/context.md)
