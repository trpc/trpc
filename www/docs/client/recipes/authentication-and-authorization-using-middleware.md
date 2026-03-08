---
title: Authentication and Authorization using middleware
sidebar_label: Auth & authorization with middleware
---

The recommended pattern is to create reusable base procedures:

- `publicProcedure`: no auth requirement
- `authedProcedure`: user must be signed in
- `adminProcedure` (or role/scoped procedures): user must satisfy authorization checks

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
