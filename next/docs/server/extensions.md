---
title: Extensions
description: Packages that add middleware, `ctx`, `meta` keys, errors and services to every procedure with `t.concat()`.
section: Server
order: 10
---

A package can add middleware, `ctx`, `meta` keys, declared errors and Effect services to every procedure of an app. An extension is a procedure builder from the package's own `initTrpc`: its root `ctx` is what it needs from the app's, its `meta` type joins the app's (its default `meta` goes underneath), and the app adds it with `t.concat()`, the same method a procedure builder takes a plugin with:

```ts twoslash
// ---cut-start---
import { error, initTrpc } from '@trpc12/trpc/server';
import type { User } from './server.ts';
declare const limiter: {
  allow: (ip: string, limit?: { max: number }) => boolean;
  remaining: (ip: string) => number;
};
const audit = () => initTrpc<{ ctx: { user: User | null } }>().procedure;
// ---cut-end---
// in a package
interface RateLimitMeta {
  rateLimit?: { max: number };
}
const r = initTrpc<{ ctx: { ip: string }; meta: RateLimitMeta }>({
  defaultMeta: { rateLimit: { max: 100 } },
});
export const rateLimit = () =>
  r.procedure
    .errors({ TOO_MANY_REQUESTS: {} })
    .use((opts) =>
      limiter.allow(opts.ctx.ip, opts.meta.rateLimit)
        ? opts.next({ ctx: { remaining: limiter.remaining(opts.ctx.ip) } })
        : error({ code: 'TOO_MANY_REQUESTS' }),
    );

// in the app
const t = initTrpc<{ ctx: { ip: string; user: User | null } }>()
  .concat(rateLimit())
  .concat(audit());

t.procedure
  .meta({ rateLimit: { max: 5 } })
  .mutation((opts) => opts.ctx.remaining);
```

Extensions chain, and `t.middleware` sees what they add. [`examples/saas-api`](../../examples/saas-api/src/tenancy.ts) has two: a tenancy extension that adds the caller's tenant and role, and an audit extension that starts with the same session middleware, so it runs once. `t.concat()` is a type error when the root lacks `ctx` the extension needs, declares one of its `meta` keys with another type, or already has an output from another extension. An extension's `.output()` is every procedure's, so they can't take another. Services an extension provides with `.provide()` don't need the handler's `layer`; services it only uses do.

## Merging `meta`

Meta keys a root doesn't declare are a type error, and a later `.meta()` replaces a key unless its root says how to merge it. An extension sets that for its own keys with `initTrpc({ mergeMeta })`.

## Building integrations

`@trpc12/trpc/extend` has what client integrations build on: `createUntypedClient` (its options keep link fields in a `context` bag, beside `type`, `path` and `input`), `runLinks`, `runOperation` (`runLinks` in a client span, with trace propagation), `callProcedure`, the wire format and JSON Schema helpers.
