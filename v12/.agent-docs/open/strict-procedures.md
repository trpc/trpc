---
title: Should a base procedure be able to require declared outputs and errors, with `.strict()`?
summary: Outputs and errors bind once declared with `.output()` and `.errors()`, but nothing requires declaring them. `.strict()` would, as `effect/rpc` does.
area: server
recommended: B
questions: [Q27.4]
links:
  - kind: spike
    label: layered-services
    url: ../../spikes/layered-services/
  - kind: proposal
    label: 27 Layered services and strictness
    url: ../proposals/27-layered-services-and-strictness.md
  - kind: decision
    label: layered-services-and-strictness
    url: ../decisions/layered-services-and-strictness.md
  - kind: decision
    label: thrown-errors-and-exhaustive-declarations
    url: ../decisions/thrown-errors-and-exhaustive-declarations.md
  - kind: note
    label: layered-services spike
    url: ../notes/layered-services-and-strictness.md
  - kind: docs
    label: Contract-first
    url: https://v12.trpc.io/v12/docs/server/contract-first
---

# Should a base procedure be able to require declared outputs and errors, with `.strict()`?

## Why it matters

The human asked "can we get it as strict as Effect rpc somehow?". Much of it landed since: with `.errors()`, a procedure may only return or fail with the errors it lists (`DeclaredCheck`), and `.output()` constrains the resolver. What's left is that declaring is optional: a procedure without `.output()` returns anything, one without `.errors()` adds whatever it fails with to the client's union, and middleware errors aren't checked. Contracts with `t.implement()` already close all of that, at the cost of a second file.

## Options

### A) Keep it as it is: declarations bind when present; contracts for the rest

```ts twoslash
// ---cut-start---
import { z } from 'zod';
import { experimental_contract } from '@trpc12/trpc/contract';
import { t, type Post as PostRow } from './server.ts';
const ById = z.object({ id: z.string() });
const Post = z.object({ id: z.string(), title: z.string() });
declare function findPost(id: string): PostRow | undefined;
declare function anything(): unknown;
const c = experimental_contract.create();
const appContract = {
  post: {
    byId: c
      .input(ById)
      .output(Post)
      .errors({ NOT_FOUND: { data: ById } })
      .query(),
  },
};
// ---cut-end---
const byId = t.procedure
  .input(ById)
  .output(Post)
  .errors({ NOT_FOUND: { data: ById } })
  .query(
    (opts) =>
      findPost(opts.input.id) ?? opts.errors.NOT_FOUND({ data: opts.input }),
  );

t.procedure.query(() => anything()); // fine: no output or errors declared

// all-required strictness: a contract and t.implement(contract)
const impl = t.implement(appContract);
export const router = impl.router({
  post: {
    byId: impl.post.byId.query(
      (opts) =>
        findPost(opts.input.id) ?? opts.errors.NOT_FOUND({ data: opts.input }),
    ),
  },
});
```

- ✅ Built; one way per need (inferred, declared, or contract)
- ✅ `.errors()` is already exhaustive, as the human asked in the thrown-errors answer
- ❌ Nothing stops a public procedure shipping without `.output()` or `.errors()`; only review catches it
- ❌ Contract-level strictness needs a contract file

### B) `.strict()` on a base procedure

An opt-in flag, inherited by everything built from it: `.output()` and `.errors()` are required, and middleware errors must be declared too.

```ts twoslash
// @errors: 2322 2345
// ---cut-start---
import { z } from 'zod';
import { error, middleware, TrpcError } from '@trpc12/trpc/server';
import { strictableB } from '../open/strict-procedures.ts';
import { t as root, type Context, type Post as PostRow } from './server.ts';
const ById = z.object({ id: z.string() });
const Post = z.object({ id: z.string(), title: z.string() });
declare function findPost(id: string): PostRow | undefined;
const authed = middleware<{ ctx: Context }>()((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);
const t = {
  procedure: {
    use: (mw: typeof authed) => strictableB(root.procedure.use(mw)),
  },
};
// ---cut-end---
const strict = t.procedure.use(authed).strict();

export const byId = strict
  .input(ById)
  .output(Post)
  .errors({ UNAUTHORIZED: {}, NOT_FOUND: { data: ById } })
  .query(
    (opts) =>
      findPost(opts.input.id) ?? opts.errors.NOT_FOUND({ data: opts.input }),
  );

// Doesn't compile: strict, so declare the output with .output()
strict.query(() => 'x');
// Doesn't compile: FORBIDDEN is not declared; add it with .errors()
strict.output(Post).query(() => new TrpcError.Forbidden());
```

- ✅ `effect/rpc`'s strictness without a contract file, per base procedure, so an app can make only its public API strict
- ✅ No bundle cost (types and a flag); reuses `DeclaredCheck` and the contract's messages
- ❌ A third mode beside inferred and contract, to document
- ❌ Type-check cost on strict procedures: the spike measured +30% instantiations over declaring output and errors (before `DeclaredCheck` landed, which already pays part of it)

### C) Required declarations everywhere

`initTrpc({ strict: true })` makes every procedure strict.

```ts twoslash
// @errors: 2345
// ---cut-start---
import { initTrpcC as initTrpc } from '../open/strict-procedures.ts';
type Ctx = { userId: string | null };
// ---cut-end---
const t = initTrpc<{ ctx: Ctx }>({ strict: true });
// Doesn't compile: declare the output with .output()
t.procedure.query(() => 'x');
```

- ✅ One switch, no base procedure to remember
- ❌ Internal and quick procedures pay the declarations too; the base-procedure flag can do this for the whole app anyway

## Recommendation

**B.** It finishes "as strict as Effect rpc" for builder users, paid only by procedures that opt in, and now mostly reuses the exhaustive `.errors()` check. Contracts stay the choice when the declaration must live apart from the code.

## Blocked until answered

- Nothing; strictness is additive.

## Details

The spike's `strict(builder)` required `.output()`, rejected undeclared errors with the contract's `UndeclaredCheck`, kept Q2.3's unmapped-failure check, and counted middleware errors declared through `.use(Key)` ([`middleware-as-service.md`](./middleware-as-service.md)) as declared. Wrong-output messages are poor in every mode: `{ id: 1 }` against `{ id: string }` reports "Property 'id' is missing in type Effect<…>". Declaring is the larger cost in any mode: Effect Schema outputs and error data took 140 to 906 instantiations per procedure.
