---
title: Better Auth
description: Read the Better Auth session in a middleware and type ctx.user with its user.
section: Integrations
order: 7
---

[Better Auth](https://better-auth.com/) reads the session from the request's headers. Put the headers in the ctx, then a [middleware](../server/middleware.md) turns the session into `ctx.user`:

```ts
const t = initTrpc<{ ctx: { headers: Headers } }>();

const authed = t.procedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({ headers: ctx.headers });
  return session
    ? next({ ctx: { user: session.user, session: session.session } })
    : error({ code: 'UNAUTHORIZED' });
});

const router = {
  me: authed.query(({ ctx }) => ctx.user.name), // ctx.user is Better Auth's user type
};

createFetchHandler({
  router,
  createContext: ({ request }) => ({
    headers: new Headers(request.headers as Record<string, string>),
  }),
});
```

- Same-origin browsers send Better Auth's session cookie with each call. From another origin, set `httpLink({ init: () => ({ credentials: 'include' }) })` and allow credentials in [CORS](../adapters/overview.md#middleware-and-cors).
- Over WebSockets, `createContext` gets the upgrade request's headers, so the cookie works there too.
- Better Auth's own routes (`/api/auth/*`) stay on `auth.handler`; serve them next to the tRPC endpoint.
