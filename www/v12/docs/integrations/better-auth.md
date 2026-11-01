---
title: Better Auth
description: Read the Better Auth session in a middleware and type `ctx.user` with its user.
section: Integrations
order: 4
experiment: integrations
---

[Better Auth](https://better-auth.com/) reads the session from the request's headers. It needs no adapter package:

```package-install
@trpc12/trpc effect better-auth
```

Put the headers in the `ctx`, then a [middleware](../server/middleware.md) turns the session into `ctx.user`:

```ts twoslash
// ---cut-start---
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { betterAuth } from 'better-auth';
const auth = betterAuth({});
// ---cut-end---
const t = initTrpc<{ ctx: { headers: Headers } }>();

const authed = t.procedure.use(async (opts) => {
  const session = await auth.api.getSession({ headers: opts.ctx.headers });
  return session
    ? opts.next({ ctx: { user: session.user, session: session.session } })
    : error({ code: 'UNAUTHORIZED' });
});

const router = t.router({
  me: authed.query((opts) => opts.ctx.user.name), // ctx.user is Better Auth's user type
});

createFetchHandler({
  router,
  createContext: (opts) => ({
    headers: new Headers(opts.request.headers as Record<string, string>),
  }),
});
```

- Same-origin browsers send Better Auth's session cookie with each call. From another origin, set `httpLink({ init: () => ({ credentials: 'include' }) })` and allow credentials in [CORS](../adapters/overview.md#middleware-and-cors).
- Over WebSockets, `createContext` gets the upgrade request's headers, so the cookie works there too. Browsers send it with an upgrade from any site, so add [`cors()`](../adapters/overview.md#middleware-and-cors) with your origins.
- Better Auth's own routes (`/api/auth/*`) stay on `auth.handler`; serve them next to the tRPC endpoint.

## Credits

This recipe follows [oRPC's Better Auth integration](https://orpc.dev/docs/integrations/better-auth).
