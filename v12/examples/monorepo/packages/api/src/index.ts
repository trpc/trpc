import { billingRouter, type BillingRouter } from '@acme/billing';
import { postsRouter, type PostsRouter } from '@acme/posts';
import { t, type Context } from '@acme/trpc';
import { usersRouter, type UsersRouter } from '@acme/users';
import type { RouterCtx } from '@trpc12/trpc/server';

// Named from the domains' types rather than inferred from the object: an
// inferred type copies every domain's procedures into this package's
// declarations, and with thousands of procedures fails with TS7056. A `type`,
// not an `interface`: routers need an index signature. `RouterCtx` is what
// `t.router()` adds, the ctx the handler's `createContext` must return.
export type AppRouter = {
  posts: PostsRouter;
  users: UsersRouter;
  billing: BillingRouter;
} & RouterCtx<Context>;

export const appRouter: AppRouter = t.router({
  posts: postsRouter,
  users: usersRouter,
  billing: billingRouter,
});
