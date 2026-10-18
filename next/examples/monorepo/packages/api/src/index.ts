import { billingRouter, type BillingRouter } from '@acme/billing';
import { postsRouter, type PostsRouter } from '@acme/posts';
import { usersRouter, type UsersRouter } from '@acme/users';

// Named from the domains' types rather than inferred from the object: an
// inferred type copies every domain's procedures into this package's
// declarations, and with thousands of procedures fails with TS7056. A `type`,
// not an `interface`: routers need an index signature.
export type AppRouter = {
  posts: PostsRouter;
  users: UsersRouter;
  billing: BillingRouter;
};

export const appRouter: AppRouter = {
  posts: postsRouter,
  users: usersRouter,
  billing: billingRouter,
};
