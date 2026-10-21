---
title: Should one registry of the backend's errors replace tRPC's built-in codes?
summary: "Declare each error once on the server; resolvers return it, declared lists restrict returns, and the client infers each call's errors with no import."
area: errors
recommended: E
links:
  - kind: spike
    label: 'B: createErrors()'
    url: ../../spikes/error-registry/create-errors/
  - kind: spike
    label: 'C: Schema.TaggedError classes'
    url: ../../spikes/error-registry/tagged-classes/
  - kind: spike
    label: 'D: builder'
    url: ../../spikes/error-registry/builder/
  - kind: spike
    label: 'E: a registry per module, declared on its base procedure'
    url: ../../spikes/error-registry/merge-errors/
  - kind: spike
    label: 'F: declaration merging'
    url: ../../spikes/error-registry/register/
  - kind: spike
    label: 'G: inferred, no registry'
    url: ../../spikes/error-registry/inferred/
  - kind: spike
    label: Error boundaries over E
    url: ../../spikes/error-registry/boundaries/
  - kind: spike
    label: Type-cost bench
    url: ../../spikes/error-registry/bench.ts
  - kind: spike
    label: Client bundle
    url: ../../spikes/error-registry/bundle.ts
  - kind: decision
    label: inferred-errors
    url: ../decisions/inferred-errors.md
  - kind: decision
    label: thrown-errors-and-exhaustive-declarations
    url: ../decisions/thrown-errors-and-exhaustive-declarations.md
  - kind: decision
    label: public-tagged-errors
    url: ../decisions/public-tagged-errors.md
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: decision
    label: exhaustive-match-error
    url: ../decisions/exhaustive-match-error.md
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
---

# Should one registry of the backend's errors replace tRPC's built-in codes?

## Why it matters

Today a procedure's errors are what it returns, or what it lists in `.errors()`. They're keyed by 25 built-in HTTP-ish codes plus custom ones, and each error's status and schema is repeated wherever it's declared. The alternative is to declare every error the backend can fail with once, on the server: its tag, status, `data` schema, OpenAPI description and whether to retry. tRPC's own failures (`InvalidInput`, `ProcedureNotFound`, `NetworkError`, `Timeout`, …) get tags too, and codes go.

Three rules hold for every option below. Each follows an earlier decision or a requirement for this one:

- **Errors are returned.** A resolver or middleware returns one (`return errors.PostNotFound({ id })`), or an Effect fails with it (`yield*`). Each procedure's union is what it returns ([inferred-errors](../decisions/inferred-errors.md)). A `throw` is for what nobody expected: the client gets `Internal`, which `matchError()` sends to `unexpected`.
- **Declared errors restrict returns.** A procedure doesn't have to declare its errors. If it does, the list is exhaustive: returning anything else is a type error, and a thrown error the list doesn't name is a crash ([thrown-errors-and-exhaustive-declarations](../decisions/thrown-errors-and-exhaustive-declarations.md): "declaration is not a _must_, but if it is declared it should be exhaustive and enforce procedures to only return/throw those"). A registry is a declaration's source, not a second rule, so these options keep that decision rather than reverse it.
- **The client gets inference only.** Declarations may weigh what they like on the server. The client types each call from `typeof appRouter` and imports none of them: `matchError()`, `safe()` and error boundaries work from types. Measured: a client of an app with a registry bundles to the same bytes as a client of an app without one (Details).

## Options

### A) Keep it: built-in codes and per-procedure inference

```ts twoslash
// ---cut-start---
import { matchError, safe } from '@trpc12/trpc/client';
import { client } from './client.ts';
// ---cut-end---
// post.byId: .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err) {
  matchError(err, {
    NOT_FOUND: (e) => `No post ${e.data.id}`,
    BAD_REQUEST: (e) => e.data.issues[0]?.message,
    NETWORK_ERROR: () => 'Offline',
    BAD_RESPONSE: () => 'Try again later',
    unexpected: (e) => e.code,
    //                   ^?
  });
}
```

- ✅ Built, with the three rules above: returned errors are inferred per procedure, and `.errors()` is exhaustive. Every other option keeps them.
- ✅ v11's codes, so a v11 user's `switch (err.code)` and the v11 handler carry over.
- ❌ An error's status and schema are written in each procedure that declares it. A `TrpcError.Tagged` class says them once, but nothing lists the classes.
- ❌ Two names per error (`code` for `matchError()`, `_tag` for `Effect.catchTag`), and 25 codes to learn.
- ❌ It costs more to check than any registry that isn't declared on every procedure. With `.errors()` and `opts.errors` on each procedure, the server alone is 953,647 instantiations, and 2,123,824 with every call matched: 18% over B. Same harness and fixtures as the others (Details).

### B) One `createErrors()` registry

The registry is an object of specs. Each key is a tag, and each value is a function that makes the error, for a resolver to return. Each value is also v12's spec for it, so the registry is a valid `.errors()` map.

```ts twoslash
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createClient,
  createErrorsB as createErrors,
  matchError,
  safe,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
// errors.ts: every error the backend has, once
export const errors = createErrors({
  Unauthorized: { status: 401, description: 'Sign in first' },
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  RateLimited: {
    status: 429,
    data: z.object({ retryAfter: z.number() }),
    retry: true,
  },
});

// Returned: post.byId's union is what it returns
const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .query(
    (opts) =>
      db.post.find(opts.input.id) ?? errors.PostNotFound({ id: opts.input.id }),
  );
export const appRouter = { post: { byId } };

// client.ts: a type import, no registry
const client = createClient<typeof appRouter>({
  links: [httpLink({ url: '/trpc' })],
});
const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err) {
  matchError(err, {
    PostNotFound: (e) => `No post ${e.data.id}`,
    NetworkError: () => 'Offline',
    BadResponse: () => 'Try again later',
    unexpected: (e) => e._tag,
    //                   ^?
  });
}
```

- ✅ One place for an error's tag, status, schema, description and retry policy. OpenAPI's error components and responses come from it. The `data` is checked when the error is made, wherever that is.
- ✅ As precise as A: `post.byId` has a `PostNotFound` key and no `RateLimited` one. The client infers it, at zero bytes.
- ✅ The cheapest declared registry: 558,158 instantiations on the server and 1,796,155 with the client (1,195 per procedure). Through the Effect client with one `Effect.catchTag`, 1,240,768.
- ❌ The registry and the procedures are apart. Nothing says a registry error is returned anywhere, and the list declares nothing unless a procedure passes it to `.errors()`.
- ❌ `.errors(errors)` on a procedure declares the whole registry. Returns are then restricted to the registry, which restricts little, and the call's union is all 24 errors: 3,152,210 instantiations with the client, the most of any option. E's per-module declaration is the useful form.

### C) `Schema.TaggedError` classes

The classes are plain Effect, with the status in Effect's `httpApiStatus`, so the same class works in `HttpApi` and Effect RPC. tRPC takes a list of them.

```ts twoslash
// @errors: 2322
// ---cut-start---
import type {} from 'effect/http-api';
import { Schema } from 'effect';
import { taggedErrorsC as taggedErrors } from '../open/error-registry.ts';
import { t } from './server.ts';
// ---cut-end---
export class PostNotFound extends Schema.TaggedError<PostNotFound>()(
  'PostNotFound',
  { id: Schema.String },
  { httpApiStatus: 404, description: 'No post with this id' },
) {}
export const errors = taggedErrors(PostNotFound);

// A Schema.TaggedError is itself an Effect, so v12 takes this one for an
// unmapped failure
t.procedure.query(() => new PostNotFound({ id: '1' }));

// Mapped per resolver, it's a v12 error with its fields as data
const byId = t.procedure.query(() =>
  errors.send(new PostNotFound({ id: '1' })),
);
```

- ✅ The most Effect-native: the error file imports nothing from tRPC, so a domain package can share it with `HttpApi` and Effect RPC.
- ❌ v12 can't carry the classes as returned errors. Returning one, or failing an Effect with one, is the "Map Effect failures to a TrpcError" type error. The spike maps them in each resolver: `errors.send()` for a return, `errors.expose()` around an Effect. The smallest `packages/` change is in Details. It isn't made.
- ❌ The client gets v12's tagged errors, with the fields as `data`, not the classes. Rebuilding instances on the client means importing the registry, which the client-inference rule rules out. So C's "same class on both sides" goes, and with it the reason to prefer C over B.
- ❌ Standard Schema (zod) `data` is out: fields are Effect Schema.
- ❌ 573,586 instantiations on the server and 1,810,938 with the client, about B's.

### D) A builder chain

```ts twoslash
// @errors: 2345
// ---cut-start---
import { z } from 'zod';
import {
  errorsD as errors,
  registryOfD as registryOf,
} from '../open/error-registry.ts';
import { t } from './server.ts';
// ---cut-end---
export const authErrors = errors().add('Unauthorized', { status: 401 });

export const appErrors = errors()
  .extend(authErrors)
  .add('PostNotFound', { status: 404, data: z.object({ id: z.string() }) })
  // A tag added twice is a type error
  .add('Unauthorized', { status: 403 });

// The chain has methods, so `.errors()` takes its entries
const declared = t.procedure.errors(registryOf(authErrors));
```

- ✅ Catches a tag declared twice, in the types and at runtime, and `extend()` composes modules.
- ❌ Says nothing B doesn't, with a longer type per step: each `.add()` intersects the registry again, and `.errors()` needs `registryOf()`.
- ❌ 560,398 instantiations on the server and 1,798,395 with the client, the same as B.

### E) A registry per module, declared on the module's base procedure

Each module declares its errors with `createErrors()`, and its base procedure declares them with v12's own `.errors()`. `mergeErrors()` makes the backend's list, for OpenAPI and docs. A tag in two modules is a type error.

```ts twoslash
// @errors: 2322
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createClient,
  createErrorsE as createErrors,
  mergeErrorsE as mergeErrors,
  safe,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
const authErrors = createErrors({ Unauthorized: { status: 401 } });
const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
const billingErrors = createErrors({
  CardDeclined: { status: 402, data: z.object({ reason: z.string() }) },
});
// The backend's list, for OpenAPI: server code, which no client imports
export const errors = mergeErrors(authErrors, postErrors, billingErrors);

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : authErrors.Unauthorized(),
);
// posts/procedure.ts: a post procedure returns post errors, and only those
const postProcedure = authed.errors(postErrors);

const appRouter = {
  post: {
    byId: postProcedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          postErrors.PostNotFound({ id: opts.input.id }),
      ),
    // Billing's error, from a posts procedure
    charge: postProcedure.mutation(() =>
      billingErrors.CardDeclined({ reason: 'limit' }),
    ),
  },
};

const client = createClient<typeof appRouter>({
  links: [httpLink({ url: '/trpc' })],
});
const [, err] = await safe(client.post.byId.query({ id: '1' }));
err?._tag;
//   ^?
```

- ✅ Each module owns its errors and declares them once, where its procedures start. v12's declaration rule then holds: a post resolver may return only post errors (the type error above), a thrown error it doesn't declare is `Internal`, and a thrown one it does declare is typed.
- ✅ A module's call fails with its module's errors and its middleware's, and nothing else. The client infers this from the router. The earlier draft's `withErrors()` and `scope()` go, since v12's declarations do the job.
- ✅ The client bundle doesn't change: 40.8 kB gzip, the same bytes as a client of an app with no registry.
- ✅ Error boundaries claim tags checked against the router's type, and a fallback's `error` is what it claims ([Error boundaries](https://v12.trpc.io/v12/decisions/open/error-registry?details=true#error-boundaries), under Details).
- ✅ One registry is the one-module case, so B is E without `mergeErrors()`. A module without a declaration infers, as B and G do.
- ❌ A module's union, not a procedure's: `post.byId` handles `TitleTaken`. That's the declaration's point (OpenAPI, the contract), and a procedure that wants its own union leaves `.errors()` off.
- ❌ Middleware errors aren't checked against a declaration (v12's rule), so `Unauthorized` is in every authed call's union whatever the module declares.
- ❌ 700,634 instantiations on the server and 2,205,120 with the client: 23% over B and 4% over today. Each call matches its module's 8 errors, and `DeclaredCheck` runs on every resolver.

### F) Declaration merging

Each module adds its registry to one interface, as `Register` does in TanStack Router.

```ts twoslash
// ---cut-start---
import { z } from 'zod';
import {
  createErrorsF as createErrors,
  type RegisteredError,
} from '../open/error-registry.ts';
// ---cut-end---
// posts/errors.ts
export const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
});
type PostErrors = typeof postErrors;
// '@trpc12/trpc' in the real API
declare module '../open/error-registry.ts' {
  interface Errors extends PostErrors {}
}

// The program's tags, with no router type
type Tag = RegisteredError['_tag'];
//   ^?
```

- ❌ Moot for calls. F's point was a union every call could read without a router type, but returned errors put each call's union on its procedure, so the interface types nothing a call fails with. Not benched, since its calls are B's.
- ✅ What's left: every tag in the program, type-only, for code with no router type to name one (a boundary's claims, say). It costs a client nothing.
- ❌ Global to the TypeScript program: two backends in one monorepo share one interface, and a `declare module` per module.

### G) Inferred, with no registry

Each error is declared once on its own, and resolvers return it. Nothing lists them.

```ts twoslash
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createClient,
  defineErrorG as defineError,
  safe,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
export const PostNotFound = defineError('PostNotFound', {
  status: 404,
  data: z.object({ id: z.string() }),
});

const appRouter = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ?? PostNotFound({ id: opts.input.id }),
      ),
    // Declared without a registry, it restricts returns all the same
    declared: t.procedure.errors({ PostNotFound }).query(() => null),
  },
};

const client = createClient<typeof appRouter>({
  links: [httpLink({ url: '/trpc' })],
});
const [, err] = await safe(client.post.byId.query({ id: '1' }));
err?._tag;
//   ^?
```

- ✅ Returned errors make G's inference what every option's client does: a call's union is what its procedure returns. G is B without the list.
- ✅ Its old ❌, "a `throw` is untyped", is now the rule for every option: a throw is unexpected. The router-wide union it used to walk (17.3M instantiations with v12's own errors in it) isn't needed: calls read their own procedure.
- ❌ No list: nothing checks that two modules don't define the same tag, and OpenAPI's error components come from v12's type generator rather than one object.
- ❌ 557,486 instantiations on the server and 1,795,485 with the client, B's.

## Recommendation

**E**, with B as its one-module case and G's inference wherever nothing is declared. The pick is the same as before, but the reasons have changed.

The earlier draft chose E for one union per subtree, computed ahead of time, with throws typed. With returned errors that union is v12's per-procedure inference, which needs no registry. What E adds is the declaration: a module states its errors once, on its base procedure, with v12's `.errors()`. Under [thrown-errors-and-exhaustive-declarations](../decisions/thrown-errors-and-exhaustive-declarations.md), that restricts what the module's resolvers return, gives OpenAPI the module's responses, and makes an undeclared throw a crash. That also closes the earlier draft's leak, where another module's thrown error got past every boundary.

E costs 4% more than today with the client, and 23% more than an undeclared registry. That's the price of a module-sized union. B declaring its whole registry costs 75% more than B. A procedure that wants its own union leaves `.errors()` off.

C is out unless `packages/` takes `Schema.TaggedError` as a public error, and even then its classes stop at the server. F is moot. G is what every option's client already is.

It keeps [inferred-errors](../decisions/inferred-errors.md), [thrown-errors-and-exhaustive-declarations](../decisions/thrown-errors-and-exhaustive-declarations.md) and [public-tagged-errors](../decisions/public-tagged-errors.md), whose `TrpcError.Tagged` the registry's errors are built on. It replaces:

- [error-tags](../decisions/error-tags.md): `code` goes, and `_tag` is an error's only name, on the wire and in `matchError()`. The 25 built-in codes, `BuiltinErrorCode` and the code classes (`TrpcError.NotFound`) give way to tRPC's own failures, listed in Details.
- [custom-error-codes](../decisions/custom-error-codes.md): there's no default status; a spec's `status` is required.
- [exhaustive-match-error](../decisions/exhaustive-match-error.md), [link-errors](../decisions/link-errors.md) and [closed-client-errors](../decisions/closed-client-errors.md):
  - `matchError()` keys are the call's tags plus `NetworkError` and `BadResponse`. Every other tRPC failure goes to `unexpected` unless a handler names it.
  - The transport failures are in every call's union.
  - `defined` goes: a returned error is the app's, and a thrown one is `Internal`.
- [error-boundary-claims](./error-boundary-claims.md) gets one answer: claims are tags.

## Blocked until answered

- The errors API in the first release: `matchError()`'s keys, `TrpcError`'s `code`, the wire's error body and the OpenAPI error schemas change under B to G. `.errors()`, `DeclaredCheck` and per-procedure inference stay as they are.
- The v11 codemod's error rules (`throw new TRPCError({ code })` becomes `return errors.X()`) and [error-boundary-claims](./error-boundary-claims.md).
- C, if wanted, needs the `packages/` change in Details. Everything else runs on v12 as it is.

## Details

- **Measured** with `node spikes/error-registry/bench.ts --procedures 1500 --errors 24 --runs 3`, on TypeScript 7.1.0-beta, single-threaded, median of three.
  - The fixture: 1,500 procedures, each returning one of 24 errors (half with `data`).
  - Every client call is consumed with `safe()` and an exhaustive `matchError()` over its own union.
  - For each option: instantiations for the server alone, then with the client (per procedure, memory, check time):
    - A (today: `.errors({ E: spec })` and `opts.errors.E()` per procedure, v12's client and `matchError()` by code): 953,647 (635); 2,123,824 (1,415, 367 MB, 2.16s).
    - B `createErrors()`, inferred: 558,158 (371); 1,796,155 (1,195, 270 MB, 1.28s). Through the Effect client with one `Effect.catchTag`: 1,240,768 (825).
    - B with `.errors(errors)` on every procedure: 699,846 (465); 3,152,210 (2,098, 316 MB, 1.92s).
    - C `Schema.TaggedError`, mapped per resolver: 573,586 (368); 1,810,938 (1,192, 282 MB).
    - D builder: 560,398 (371); 1,798,395 (1,195).
    - E, 3 modules of 8 errors, each declared on its module's base procedure, each call matching a spread of its module's handlers: 700,634 (464); 2,205,120 (1,466, 278 MB, 1.55s).
    - G inferred: 557,486 (371); 1,795,485 (1,195).
  - The earlier draft typed every call with one router-wide union, and errors were thrown. It checked cheaper: B 1,460,538 and E 1,189,054 with the client, because one union shared by every call is computed once. But that union was the wrong one.
- **The client bundle**, from `node spikes/error-registry/bundle.ts`: one function that calls `post.byId` and `matchError()`s every tag. Rolldown, minified, gzip -9, as `pnpm bench budget` does.
  - Today, v12's client and `matchError()` by code: 121.2 kB, 40.3 kB gzip.
  - The shared client, for an app with no registry (v12's `TrpcError.Tagged` classes): 122.2 kB, 40.8 kB gzip.
  - The same client source for E's app, whose modules have registries: 122.2 kB, 40.8 kB gzip, the same bytes. None of the registry's strings are in it (descriptions, messages, `CardDeclined`, zod).
  - The control, the same client importing the registries at runtime, as a client that rebuilt errors from them would: 246.6 kB, 75.6 kB gzip (+34.8 kB). This is why C's client can't rebuild its classes.
  - The 0.5 kB over today is the client's fixed mapping from v12's codes to tRPC's failure tags (`toFailure()`). Built into the package, it would replace the code handling it stands in for.
- **v12 carries returned errors as it is.** No `packages/` change is needed for B, D, E, F or G:
  - A registry error is a v12 `TrpcError.Tagged` whose code is its tag. Returned from a resolver or middleware, or `yield*`ed in an Effect, it's inferred into the procedure's union with `defined: true`, and sent with its class's status.
  - A registry entry carries v12's spec statics (`tag`, `status`, `data`, `message`), so `.errors(postErrors)` declares a module and `DeclaredCheck` rejects any other return. Tested in `merge-errors.test.ts` and `create-errors.test.ts`.
- **C needs one `packages/` change, not made:** v12 would treat a `Schema.TaggedError` as a public error.
  - In the types (`SplitReturn` in `server/procedures/builder.ts`), a returned or failed instance with a `_tag` would go into the procedure's errors as `TrpcError<Tag, Encoded fields, Tag>`, not into the output or the "unmapped" check.
  - At runtime (`server/execution/execute.ts`), the error would be encoded with its class's schema into `{ code: _tag, data: fields }`, with the status from its `httpApiStatus` annotation (400 without one).
  - That reverses [public-tagged-errors](../decisions/public-tagged-errors.md)' "a `Schema.TaggedError` isn't accepted". The client would still get tagged errors, not the classes.
- **tRPC's own failures** (`spikes/error-registry/shared/failures.ts`, client code of a fixed size) are tagged errors in every call's union:
  - Required in `matchError()`: `NetworkError` and `BadResponse`.
  - Sent to `unexpected` unless a handler names them:
    - `InvalidInput` (400, `data.issues`)
    - `ProcedureNotFound` (404, a client newer than its server)
    - `ProcedureTypeMismatch` (405)
    - `MalformedRequest` (400: today's `PARSE_ERROR`, or a bad batch, body or transformer)
    - `PayloadTooLarge` (413)
    - `Internal` (500, masked; a crash or a thrown error)
    - `UnexpectedStatus` (a proxy's 401 or 502, its status in `data`)
    - `Timeout`, `Aborted` and `StreamInterrupted`
  - The earlier draft's `UnknownError` is gone. With no registry on the client, a tag its types don't know arrives as it is (a server newer than its client), and `matchError()` sends it to `unexpected`.
  - Retry policy is the spec's `retry`, since "5xx retries" has no code to read.
- **The wire**, on v12's handler: `404 { "error": { "code": "PostNotFound", "message": "PostNotFound", "data": { "id": "nope" }, "defined": true } }`. Under the proposal, `code` becomes `tag` and `defined` goes.
- **OpenAPI:** `registryToOpenApi()` gives a component per tag (`{ tag: const, message, data }`), and a response per status that is `oneOf` the tags sharing it. Transport-only failures (status 0, 499) are left out. With E, an operation's responses are its module's.
- **v11 interop:** the v11 handler already maps an unknown code to a v11 one by status. `PostNotFound` reaches a v11 client as `NOT_FOUND` (`-32004`), with `data.code: 'NOT_FOUND'` and `httpStatus: 404`. Nothing to build.
- **Found while spiking:**
  - A declared procedure's union is its whole declaration, not what it returns. That's what makes E's union module-sized, and B's `.errors(errors)` registry-sized.
  - An error thrown from a declared procedure with a declared code is typed, as v12 has it (`merge-errors.test.ts`). So "throws are unexpected" holds where nothing declares the error.
  - A registry entry must be a function with v12's spec statics, not a class. A class's `prototype` and `name` would be read as spec fields; a function with properties is both the maker and the spec.
- **Prior art:**
  - oRPC's error map (`.errors({ NOT_FOUND: { status, data } })` per procedure, with a shared map spread in) is A's shape with B's metadata.
  - Effect `HttpApi` (`addError(Class, { status })`) and Effect RPC (`error:` per RPC) are per-endpoint and class-based, like C.
  - result-rpc shares one map between middleware and the shell, as E's modules do.

### Error boundaries

This is how E's returned errors work with `createErrorBoundary`, which is built in `packages/tanstack-react-query/src/error-boundary.ts` and unexported. It's the same factory, and the same `useAuthBoundary()` with `{ query, infiniteQuery, mutation, owns }`; `claims` takes tags instead of codes.

The boundaries are built in [`spikes/error-registry/boundaries/`](../../spikes/error-registry/boundaries/), on the internal boundary as it is. An app error's `code` there is its tag, and so is a tRPC failure's, so claiming a tag is claiming a code. `unexpected: true` claims tRPC's unexpected tags (`Internal`, `Timeout`, `UnexpectedStatus`, …) by name. Each example below has today's version, with codes, after it.

A boundary names the router whose tags it claims with `routerType<AppRouter>()`, v12's type-only marker. The client imports no registry, and a fallback's `error` is what the boundary claims:

```tsx twoslash
// ---cut-start---
import { routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createErrorBoundaryE as createErrorBoundary,
  createErrorsE as createErrors,
} from '../open/error-registry.ts';
import { t } from './server.ts';
const authErrors = createErrors({
  Unauthorized: { status: 401 },
  Forbidden: { status: 403 },
});
const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
});
const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) return authErrors.Unauthorized();
  if (opts.ctx.user.name === 'guest') return authErrors.Forbidden();
  return opts.next({ ctx: { user: opts.ctx.user } });
});
const appRouter = {
  posts: {
    byId: authed
      .errors(postErrors)
      .input(z.object({ id: z.string() }))
      .query((opts) => postErrors.PostNotFound({ id: opts.input.id })),
  },
};
type AppRouter = typeof appRouter;
// ---cut-end---
const router = routerType<AppRouter>();

const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  router,
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
  //                               ^?
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  router,
  parent: RootBoundary,
  claims: ['NetworkError'],
  fallback: () => 'You are offline',
});
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  router,
  parent: OfflineBoundary,
  claims: ['Unauthorized', 'Forbidden'],
  fallback: (props) => `Sign in: ${props.error.message}`,
  //                                     ^?
});
```

```tsx twoslash
// ---cut-start---
import { createErrorBoundary } from '../../../../packages/tanstack-react-query/src/error-boundary.ts';
// ---cut-end---
// Today: codes, unchecked, and the fallback's error is unknown
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: (props) => String(props.error),
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  parent: RootBoundary,
  claims: ['NETWORK_ERROR'],
  fallback: () => 'You are offline',
});
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  parent: OfflineBoundary,
  claims: ['UNAUTHORIZED', 'FORBIDDEN'],
  fallback: (props) => String(props.error),
  //                                ^?
});
```

The next example is a query whose procedure is declared by the posts module. Its union is the auth middleware's returned errors, the module's declared ones and tRPC's. Under `<AuthBoundary>`, which sits in `Offline` and `Root`, the owned tags go, so a `matchError()` below it takes `PostNotFound`, `TitleTaken` and `BadResponse`, and no `unexpected`:

```tsx twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createErrorBoundaryE as createErrorBoundary,
  createErrorsE as createErrors,
  createTrpcContextE as createTrpcContext,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
const authErrors = createErrors({
  Unauthorized: { status: 401 },
  Forbidden: { status: 403 },
});
const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) return authErrors.Unauthorized();
  if (opts.ctx.user.name === 'guest') return authErrors.Forbidden();
  return opts.next({ ctx: { user: opts.ctx.user } });
});
const appRouter = {
  posts: {
    byId: authed
      .errors(postErrors)
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          postErrors.PostNotFound({ id: opts.input.id }),
      ),
  },
};
type AppRouter = typeof appRouter;
const router = routerType<AppRouter>();
const [, useTrpc] = createTrpcContext<AppRouter>();
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  router,
  claims: [],
  unexpected: true,
  fallback: () => null,
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  router,
  parent: RootBoundary,
  claims: ['NetworkError'],
  fallback: () => null,
});
const [, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  router,
  parent: OfflineBoundary,
  claims: ['Unauthorized', 'Forbidden'],
  fallback: () => null,
});
// ---cut-end---
function PostTitle(props: { id: string }) {
  const trpc = useTrpc();
  const options = trpc.posts.byId.queryOptions({ input: { id: props.id } });

  const plain = useQuery(options);
  plain.error?._tag;
  //           ^?

  const post = useQuery(useAuthBoundary().query(options));
  post.error;
  //   ^?
  post.error?._tag;
  //          ^?
}
```

```tsx twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { z } from 'zod';
import { createErrorBoundary } from '../../../../packages/tanstack-react-query/src/error-boundary.ts';
import { authed } from './server.ts';
const router = {
  post: {
    byId: authed
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Hello' })),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: () => null,
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  parent: RootBoundary,
  claims: ['NETWORK_ERROR'],
  fallback: () => null,
});
const [, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  parent: OfflineBoundary,
  claims: ['UNAUTHORIZED', 'FORBIDDEN'],
  fallback: () => null,
});
// ---cut-end---
// Today: the procedure's own codes, and every built-in one
function PostTitle(props: { id: string }) {
  const trpc = useTrpc();
  const options = trpc.post.byId.queryOptions({ input: { id: props.id } });

  const plain = useQuery(options);
  plain.error?.code;
  //           ^?

  const post = useQuery(useAuthBoundary().query(options));
  post.error?.code;
  //          ^?
}
```

The next example is a mutation under a boundary that claims a tag its union can't have: billing's `CardDeclined` over a posts mutation. It's a no-op, not a type error, since a boundary doesn't know the calls under it. Three claims are type errors, with TypeScript's "did you mean" where it has one:

- a tag no procedure returns or declares;
- a tag outside the subtree a module's boundary names (`routerType<AppRouter['posts']>()`);
- a posts resolver returning `CardDeclined`.

Today the same claim isn't a no-op. Every call's union has every built-in code, so claiming `PAYMENT_REQUIRED` takes the built-in one out, and a misspelt code compiles and owns nothing:

```tsx twoslash
// @errors: 2820 2322
// ---cut-start---
import { useMutation } from '@tanstack/react-query';
import { routerType } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createErrorBoundaryE as createErrorBoundary,
  createErrorsE as createErrors,
  createTrpcContextE as createTrpcContext,
} from '../open/error-registry.ts';
import { t } from './server.ts';
const authErrors = createErrors({ Unauthorized: { status: 401 } });
const postErrors = createErrors({
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
const billingErrors = createErrors({ CardDeclined: { status: 402 } });
const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : authErrors.Unauthorized(),
);
const postProcedure = authed.errors(postErrors);
const appRouter = {
  posts: {
    rename: postProcedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => opts.input),
  },
  billing: {
    charge: authed
      .errors(billingErrors)
      .mutation(() => billingErrors.CardDeclined()),
  },
};
type AppRouter = typeof appRouter;
const router = routerType<AppRouter>();
const [, useTrpc] = createTrpcContext<AppRouter>();
// ---cut-end---
const [, useBillingBoundary] = createErrorBoundary({
  name: 'Billing',
  router,
  claims: ['CardDeclined'],
  fallback: (props) => props.error._tag,
});

function Rename() {
  const trpc = useTrpc();
  const rename = useMutation(
    useBillingBoundary().mutation(trpc.posts.rename.mutationOptions()),
  );
  rename.error?._tag; // as without the boundary
  //            ^?
}

createErrorBoundary({
  name: 'Typo',
  router,
  claims: ['Unauthorised'],
  fallback: () => null,
});

createErrorBoundary({
  name: 'Posts',
  router: routerType<AppRouter['posts']>(),
  // Billing's tag, on the posts module's boundary
  claims: ['CardDeclined'],
  fallback: () => null,
});

// And a posts resolver can't return it in the first place
postProcedure.mutation(() => billingErrors.CardDeclined());
```

```tsx twoslash
// ---cut-start---
import { useMutation } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { z } from 'zod';
import { createErrorBoundary } from '../../../../packages/tanstack-react-query/src/error-boundary.ts';
import { authed } from './server.ts';
const router = {
  post: {
    rename: authed
      .errors({ CONFLICT: { message: 'That title is taken' } })
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => opts.input),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
// ---cut-end---
// Today: every built-in code is in every call's union, so the claim
// takes the built-in PAYMENT_REQUIRED out; a misspelt code compiles
const [, useBillingBoundary] = createErrorBoundary({
  name: 'Billing',
  claims: ['PAYMENT_REQUIRED'],
  fallback: () => 'Card declined',
});

function Rename() {
  const trpc = useTrpc();
  const rename = useMutation(
    useBillingBoundary().mutation(trpc.post.rename.mutationOptions()),
  );
  rename.error?.code;
  //            ^?
}

createErrorBoundary({
  name: 'Typo',
  claims: ['UNAUTHORISED'],
  fallback: () => null,
});
```

Rough edges, each covered by `boundaries.test.ts`:

- **The earlier draft's leak is gone.** A posts procedure can't return billing's `CardDeclined` (a type error). If it throws it, the error is undeclared, so v12 sends `INTERNAL_SERVER_ERROR` and `Root` shows `Internal`. Before, the error arrived as `CardDeclined`, which no boundary owned and no type listed.
- **Claims are checked against the router, not the calls below.** Claiming `CardDeclined` over posts components is a silent no-op, because the boundary is made before anything under it is known. A module's boundary can name its subtree (`routerType<AppRouter['posts']>()`) to narrow what it may claim.
- **Every boundary takes `router`.** It's type-only (`routerType()` is an empty object), and a boundary from `createTrpcContext()`'s tuple could carry it instead. A boundary's tags come from `inferRouterErrors`, a walk of the router per boundary. That isn't measured at 1,500 procedures.
- **`BadResponse` stays in every component's union** unless a boundary claims it. Today `Root`'s `unexpected: true` owns `BAD_RESPONSE`, which is `defined: false`, so today's `post.error` is `BAD_REQUEST | NOT_FOUND`. Here it's a required `matchError()` key, as `NetworkError` is. It could join the unexpected tags.
- **A child can re-claim a tag its parent owns**, silently, as with codes today. The child takes it first.
- **`unexpected: true` is a list of tags**, so a fallback reads `error._tag` from ten of tRPC's failures and nothing else. A render crash still goes past it, as [error-boundary-render-errors](./error-boundary-render-errors.md) A says.
- **Not measured:** the boundary's `Exclude` by tag is one pass over a call's union, as today's by code is.
