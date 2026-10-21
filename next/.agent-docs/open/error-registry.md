---
title: Should one registry of the backend's errors replace tRPC's built-in codes?
summary: 'Declare every error once, with its status and schema; every call fails with that union, a `throw` is typed and errors have tags, not codes.'
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
    label: 'E: mergeErrors() and scope()'
    url: ../../spikes/error-registry/merge-errors/
  - kind: spike
    label: 'F: declaration merging'
    url: ../../spikes/error-registry/register/
  - kind: spike
    label: 'G: inferred from the router'
    url: ../../spikes/error-registry/inferred/
  - kind: spike
    label: Type-cost bench
    url: ../../spikes/error-registry/bench.ts
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: decision
    label: inferred-errors
    url: ../decisions/inferred-errors.md
  - kind: decision
    label: thrown-errors-and-exhaustive-declarations
    url: ../decisions/thrown-errors-and-exhaustive-declarations.md
  - kind: decision
    label: exhaustive-match-error
    url: ../decisions/exhaustive-match-error.md
  - kind: decision
    label: closed-client-errors
    url: ../decisions/closed-client-errors.md
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
---

# Should one registry of the backend's errors replace tRPC's built-in codes?

## Why it matters

Today a procedure's errors are inferred from what it returns, or listed in `.errors()`, and keyed by 25 built-in HTTP-ish codes plus custom ones. A `throw` from a helper is untyped unless the procedure declares it, so v11 code that throws gets `unexpected` on the client, and each error's status and schema is repeated wherever it's declared. The alternative: declare every error the backend can fail with once (tag, status, `data` schema, OpenAPI description, whether to retry), and type every call with that union ahead of time, the way Effect's tagged errors work. tRPC's own failures (`InvalidInput`, `ProcedureNotFound`, `NetworkError`, `Timeout`, …) become a registry like the app's, and codes go.

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

- ✅ Built, and the most precise: a call's union is what its procedure returns or declares, so `post.byId` has a `NOT_FOUND` key and no `CONFLICT` one
- ✅ v11's codes, so a v11 user's `switch (err.code)` and the v11 handler carry over
- ❌ A thrown error is untyped unless the procedure lists it in `.errors()`, and each declaration repeats the error's status and schema
- ❌ Two names per error (`code` for `matchError()`, `_tag` for `Effect.catchTag`), and 25 codes a user has to learn
- ❌ Costs the most to check: `.errors()` on every procedure is 1,024,788 instantiations on the server (683 per procedure); with the client, `safe()` and `matchError()` on every call 1,687,772, `Effect.catchTag` 1,909,902

### B) One `createErrors()` registry

The registry is an object of specs; each key is a tag, and each value makes a class. `withErrors()` types the router with it.

```ts twoslash
// @errors: 2345
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createClientB as createClient,
  createErrorsB as createErrors,
  matchError,
  safe,
  withErrorsB as withErrors,
} from '../open/error-registry.ts';
import { t } from './server.ts';
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

// Thrown from a procedure, a middleware or a helper, it's typed
const byId = t.procedure.input(z.object({ id: z.string() })).query((opts) => {
  throw new errors.PostNotFound({ id: opts.input.id });
});
export const appRouter = withErrors(errors, { post: { byId } });

const client = createClient<typeof appRouter>({
  links: [httpLink({ url: '/trpc' })],
  errors,
});
const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err) {
  // Every call can fail with every registry error, and NetworkError
  matchError(err, {
    Unauthorized: () => 'Sign in',
    PostNotFound: (e) => `No post ${e.data.id}`,
    RateLimited: (e) => `Retry in ${e.data.retryAfter}s`,
    BadResponse: () => 'Try again later',
    unexpected: (e) => e._tag,
  });
}
```

- ✅ One place for an error's tag, status, schema, description and retry policy; OpenAPI's error components and responses come from it, and the `data` is checked when the error is made, so a thrown one is as safe to send as a returned one
- ✅ `throw` and `return` are the same, typed from anywhere: no `.errors()`, no `warnThrownErrors`, and v11 code that throws keeps working typed
- ✅ Effect gets a small fixed union: `Effect.catchTag` costs 743,038 instantiations with the client, against 1,909,902 today
- ❌ Coarser than A: `post.byId` must handle `RateLimited` and every other registry error, though it can't fail with them; the usual call spreads one app-wide handlers object
- ❌ Its cost grows with the registry, since each call matches all of it: 489,991 on the server and 1,460,538 with the client at 24 errors (966 per procedure), 2,928,546 at 96

### C) `Schema.TaggedError` classes

The classes are plain Effect, with the status in Effect's `httpApiStatus`, so the same class works in `HttpApi` and Effect RPC. tRPC takes a list of them.

```ts twoslash
// ---cut-start---
import type {} from 'effect/http-api';
import { httpLink } from '@trpc12/trpc/client';
import { Schema } from 'effect';
import { z } from 'zod';
import {
  createClientC as createClient,
  safe,
  taggedErrorsC as taggedErrors,
  withErrorsC as withErrors,
} from '../open/error-registry.ts';
import { t } from './server.ts';
// ---cut-end---
export class PostNotFound extends Schema.TaggedError<PostNotFound>()(
  'PostNotFound',
  { id: Schema.String },
  { httpApiStatus: 404, description: 'No post with this id' },
) {}
export const errors = taggedErrors(PostNotFound);

// Without the bridge, v12 masks a class that isn't a TrpcError
const procedure = t.procedure.use(errors.bridge);
const appRouter = withErrors(errors, {
  post: {
    byId: procedure.input(z.object({ id: z.string() })).query((opts) => {
      throw new PostNotFound({ id: opts.input.id });
    }),
  },
});

const client = createClient<typeof appRouter>({
  links: [httpLink({ url: '/trpc' })],
  errors,
});
const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err?._tag === 'PostNotFound') {
  err.id;
  //  ^?
}
```

- ✅ The most Effect-native: no tRPC import in the error file, so a domain package can share it with `HttpApi` and Effect RPC; the client rebuilds real class instances, with their fields and `instanceof`
- ❌ Needs a `packages/` change to be more than a spike: v12 rejects an Effect resolver failing with a non-`TrpcError` at compile time and masks a thrown one at runtime, so the spike bridges with a middleware and an `errors.expose()` around Effect resolvers
- ❌ Standard Schema (zod) `data` is out; fields are Effect Schema
- ❌ The most expensive registry: 623,270 instantiations on the server (+27% on B), 1,537,980 with the client, 823,482 with `Effect.catchTag`

### D) A builder chain

```ts twoslash
// @errors: 2345
// ---cut-start---
import { z } from 'zod';
import { errorsD as errors } from '../open/error-registry.ts';
// ---cut-end---
export const authErrors = errors().add('Unauthorized', { status: 401 });

export const appErrors = errors()
  .extend(authErrors)
  .add('PostNotFound', { status: 404, data: z.object({ id: z.string() }) })
  // A tag added twice is a type error
  .add('Unauthorized', { status: 403 });
```

- ✅ Catches a tag declared twice, in the types and at runtime, and `extend()` composes modules
- ❌ Says nothing B doesn't, with a longer type per step: each `.add()` intersects the registry again, and hovers show the chain
- ❌ 492,427 instantiations on the server, about B's; 1,533,756 with the client, 5% over B

### E) A registry per module, merged, with scopes

Each module declares its own errors with `createErrors()`; `mergeErrors()` makes the backend's (a tag in two is a type error), and `scope()` gives a subtree its module's errors on top of its parent's.

```ts twoslash
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createClientE as createClient,
  createErrorsE as createErrors,
  mergeErrorsE as mergeErrors,
  safe,
  scopeE as scope,
  withErrorsE as withErrors,
} from '../open/error-registry.ts';
import { t } from './server.ts';
// ---cut-end---
const authErrors = createErrors({ Unauthorized: { status: 401 } });
const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
});
const billingErrors = createErrors({
  CardDeclined: { status: 402, data: z.object({ reason: z.string() }) },
});
// The whole backend's, for OpenAPI and the client's decoding
export const errors = mergeErrors(authErrors, postErrors, billingErrors);

const appRouter = withErrors(authErrors, {
  post: scope(postErrors, {
    byId: t.procedure.query(() => {
      throw new postErrors.PostNotFound({ id: '1' });
    }),
  }),
  billing: scope(billingErrors, {
    charge: t.procedure.mutation(() => ({ ok: true })),
  }),
});

const client = createClient<typeof appRouter>({
  links: [httpLink({ url: '/trpc' })],
  errors,
});
// A billing call has auth's and billing's errors, not the posts'
const [, err] = await safe(client.billing.charge.mutate());
err?._tag;
//   ^?
```

- ✅ B's single declaration, with each module owning its errors, and a call's union closer to what it can do: `post.*` has no `CardDeclined`
- ✅ The cheapest with the client: 1,189,054 instantiations (785 per procedure, −30% on today's `matchError()`), since each call matches its scope's errors
- ✅ A single registry is the one-module case, so B is this without `mergeErrors()` and `scope()`
- ✅ Error boundaries claim tags the registry checks, and a fallback's `error` is what it claims ([Error boundaries](https://v12.trpc.io/v12/decisions/open/error-registry?details=true#error-boundaries), under Details)
- ❌ A scope is still a module's errors, not a procedure's: `post.list` handles `PostNotFound`
- ❌ Two calls to learn on top of `createErrors()`, and a procedure that throws another module's error outside its scope sends it, untyped on the client (`unexpected`)

### F) Declaration merging

Each module adds its registry to one interface the client reads, as `Register` does in TanStack Router. The router carries nothing.

```ts twoslash
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createClientF as createClient,
  createErrorsF as createErrors,
  safe,
} from '../open/error-registry.ts';
import type { AppRouter } from './server.ts';
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

const client = createClient<AppRouter>({
  links: [httpLink({ url: '/trpc' })],
  errors: postErrors,
});
const [, err] = await safe(client.post.byId.query({ id: '1' }));
err?._tag;
//   ^?
```

- ✅ No router plumbing: modules register where they're declared, and a package can register its own errors
- ✅ Cheap: 489,719 instantiations on the server and 1,400,009 with the client
- ❌ Global to the TypeScript program: two backends in one monorepo share one union, and a client that doesn't import a module's errors file lacks them, silently
- ❌ `declare module` boilerplate per module, and the error union isn't the router's, so a router type alone (`inferRouterErrors`) can't say it

### G) Inferred from the router

Errors are still classes declared once, but there's no registry object: a call's union is every error any procedure returns or fails with (`inferRouterErrors`).

```ts twoslash
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { z } from 'zod';
import {
  createClientG as createClient,
  defineErrorG as defineError,
  safe,
} from '../open/error-registry.ts';
import { t } from './server.ts';
// ---cut-end---
class PostNotFound extends defineError('PostNotFound', {
  status: 404,
  data: z.object({ id: z.string() }),
}) {}
class RateLimited extends defineError('RateLimited', { status: 429 }) {}

const appRouter = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => new PostNotFound({ id: opts.input.id })),
    // Thrown, so it reaches the client but isn't in the union
    hot: t.procedure.query(() => {
      throw new RateLimited();
    }),
  },
};

const client = createClient<typeof appRouter>({
  links: [httpLink({ url: '/trpc' })],
  errors: { PostNotFound, RateLimited },
});
const [, err] = await safe(client.post.hot.query());
err?._tag;
//   ^?
```

- ✅ Nothing to list: the union is what the code does, and an error class nobody returns isn't in it
- ❌ A `throw` is untyped, as today: the error arrives (as `UnknownError`, or its class when the client's decoder knows it) but no type says so
- ❌ The union depends on a walk of the whole router, which is fragile: with v12's own errors left in it (each procedure's `BAD_REQUEST` types its issues from its input) it costs 17,313,751 instantiations with the client and 12.6s; without them, 520,523 on the server and 1,517,350 with the client

## Recommendation

**E**, with B as its one-module case. It is what "build all possible errors and infer the union ahead of time" asks for, it makes a `throw` typed (the v11 habit that A turns into `unexpected`), and it's the cheapest option with the client while keeping a call's union close to its module. C's classes are the better Effect story, but need a `packages/` bridge and cost 27% more; `createErrors()` can take a `Schema.TaggedError` class as a spec later without changing E. It replaces or reverses:

- [error-tags](../decisions/error-tags.md): `code` goes, and `_tag` is an error's only name, on the wire and in `matchError()` (by `_tag`); the 25 built-in codes, `BuiltinErrorCode` and the code classes (`TrpcError.NotFound`) give way to tRPC's own registry, listed in Details.
- [inferred-errors](../decisions/inferred-errors.md) and [thrown-errors-and-exhaustive-declarations](../decisions/thrown-errors-and-exhaustive-declarations.md): `.errors()`, `opts.errors`, `DeclaredCheck`, `UndeclaredError` and `warnThrownErrors` go; a call's union is its scope's registry, not its procedure's inferred errors.
- [custom-error-codes](../decisions/custom-error-codes.md): there's no default status; a spec's `status` is required.
- [exhaustive-match-error](../decisions/exhaustive-match-error.md), [link-errors](../decisions/link-errors.md) and [closed-client-errors](../decisions/closed-client-errors.md): `matchError()` keys are the scope's tags plus `NetworkError` and `BadResponse`, and every other failure of tRPC's goes to `unexpected` unless a handler names it. Links no longer declare codes; the transport failures are always in the union. `defined` goes: an error is in the registry or it's `Internal`.
- [error-boundary-claims](./error-boundary-claims.md) has one answer: claims are tags.

## Blocked until answered

- The errors API in the first release: `matchError()`'s keys, `.errors()`, `TrpcError`'s constructor and `code`, the wire's error body, and the OpenAPI error schemas all change under B to G.
- The v11 codemod's error rules (`new TRPCError({ code })` becomes a registry class) and [error-boundary-claims](./error-boundary-claims.md).
- Nothing else; the spikes run on v12 as it is.

## Details

- **Measured** with `node spikes/error-registry/bench.ts --procedures 1500 --runs 3` on TypeScript 7.1.0-beta, single-threaded, median of three: 1,500 procedures over a 24-error registry, every client call consumed with `safe()` and a `matchError()` spreading an app-wide handlers object. Instantiations, server alone, then with the client:
  - A (today, `pnpm bench shapes` on the same commit): `plain` 526,185, `errors` 1,024,788; with the client `match` 1,687,772 (326 MB, 1.78s), `effect client` 1,909,902. Its fixtures differ (outputs, `.errors()` per procedure), so compare the direction, not the digits.
  - B `createErrors()`: 489,991 (319 per procedure); 1,460,538 (966, 251 MB, 1.23s); `Effect.catchTag` 743,038 (488). At 96 errors: 496,687; 2,928,546 (1,940, 365 MB, 2.66s).
  - C `Schema.TaggedError`: 623,270 (397); 1,537,980 (1,007, 260 MB); `Effect.catchTag` 823,482 (531).
  - D builder: 492,427 (320); 1,533,756 (1,014).
  - E merged with scopes (3 modules of 7 errors, 3 shared): 491,363 (319); 1,189,054 (785, 230 MB, 1.08s).
  - F declaration merging: 489,719 (319); 1,400,009 (926).
  - G inferred: 520,523 (341); 1,517,350 (1,005, 267 MB). With v12's own errors left in the union: 17,313,751 (11,536, 12.6s).
- **tRPC's own failures**, a registry like the app's (`spikes/error-registry/shared/framework.ts`). Required in `matchError()`: `NetworkError` and `BadResponse`. To `unexpected` unless named: `InvalidInput` (400, `data.issues`), `ProcedureNotFound` (404, a client newer than its server), `ProcedureTypeMismatch` (405), `MalformedRequest` (400: today's `PARSE_ERROR`, a bad batch or body; the server-side tags stay for `onError`), `PayloadTooLarge` (413), `Internal` (500, masked), `UnknownError` (a tag the client's registry lacks, a server newer than its client), `UnexpectedStatus` (a proxy's 401 or 502, its status in `data`), `Timeout`, `Aborted` and `StreamInterrupted`. Retry policy is the spec's `retry`, since "5xx retries" has no code to read.
- **The wire**, as the spikes send it today, on v12's handler: `404 { "error": { "code": "PostNotFound", "message": "PostNotFound", "data": { "id": "nope" }, "defined": false } }`. Built on `TrpcError.Tagged`, a registry error's code is its tag and its status the spec's, so v12 sends it unchanged; under the proposal `code` becomes `tag` and `defined` goes.
- **OpenAPI:** `registryToOpenApi()` gives a component per tag (`{ tag: const, message, data }`) and a response per status, `oneOf` the tags that share it; transport-only failures (status 0, 499) are left out. With E, an operation's responses could be its scope's.
- **v11 interop:** the v11 handler already maps an unknown code to a v11 one by status: `PostNotFound` reaches a v11 client as `NOT_FOUND` (`-32004`), `data.code: 'NOT_FOUND'`, `httpStatus: 404`. Nothing to build.
- **Found while spiking:**
  - A router typed with a phantom key (`withErrors()`, `scope()`) must keep its value keyless: v12's router walks (`inferRouterServices`, ctx, errors) descend into every key, and an error-instance phantom made `createFetchHandler` require a `runtime`. A function-valued symbol key adds nothing.
  - `inferRouterErrors` over a big router carries one `BAD_REQUEST` per procedure input, which G must drop; today's per-procedure unions don't hit it because each call reads only its own.
  - A whole-backend union makes every call's `matchError()` as long as the registry, so the docs would lead with one app-wide handlers object and per-call overrides; that's what the bench measures.
- **Prior art:** oRPC's error map (`.errors({ NOT_FOUND: { status, data } })` per procedure, a shared map spread in) is A's shape with B's metadata; Effect `HttpApi` (`addError(Class, { status })`) and Effect RPC (`error:` per RPC) are per-endpoint and class-based like C; result-rpc shares one map between middleware and the shell, as E's modules do.

### Error boundaries

How E's union works with `createErrorBoundary` (built in `packages/tanstack-react-query/src/error-boundary.ts`, unexported): the same factory and the same `useAuthBoundary()` with `{ query, infiniteQuery, mutation, owns }`, with `claims` taking the registry's tags instead of codes. Built in [`spikes/error-registry/boundaries/`](../../spikes/error-registry/boundaries/) on the internal boundary as it is, since a registry error's `code` is its tag there; `unexpected: true` claims tRPC's unexpected tags (`Internal`, `Timeout`, `UnknownError`, …) by name. Each example has today's version, with codes, after it.

The registry's version takes the registry the claims are checked against (`errors`, the merged one or a module's), so a fallback's `error` is what it claims:

```tsx twoslash
// ---cut-start---
import { z } from 'zod';
import {
  createErrorBoundaryE as createErrorBoundary,
  createErrorsE as createErrors,
  mergeErrorsE as mergeErrors,
} from '../open/error-registry.ts';
const rootErrors = createErrors({
  Unauthorized: { status: 401 },
  Forbidden: { status: 403 },
});
const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
});
const billingErrors = createErrors({ CardDeclined: { status: 402 } });
// ---cut-end---
const errors = mergeErrors(rootErrors, postErrors, billingErrors);

const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors,
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
  //                               ^?
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  errors,
  parent: RootBoundary,
  claims: ['NetworkError'],
  fallback: () => 'You are offline',
});
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors,
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

A query in the posts module's `scope()`. Its union is the root registry's errors, the module's and tRPC's; under `<AuthBoundary>`, which sits in `Offline` and `Root`, the owned tags go, so `matchError()` below it takes `PostNotFound`, `TitleTaken` and `BadResponse` and no `unexpected`:

```tsx twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  createErrorBoundaryE as createErrorBoundary,
  createErrorsE as createErrors,
  createTrpcContextE as createTrpcContext,
  mergeErrorsE as mergeErrors,
  scopeE as scope,
  withErrorsE as withErrors,
} from '../open/error-registry.ts';
import { t } from './server.ts';
const rootErrors = createErrors({
  Unauthorized: { status: 401 },
  Forbidden: { status: 403 },
});
const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
const errors = mergeErrors(rootErrors, postErrors);
const appRouter = withErrors(rootErrors, {
  posts: scope(postErrors, {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Hello' })),
  }),
});
const [, useTrpc] = createTrpcContext<typeof appRouter>();
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors,
  claims: [],
  unexpected: true,
  fallback: () => null,
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  errors,
  parent: RootBoundary,
  claims: ['NetworkError'],
  fallback: () => null,
});
const [, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors,
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

A mutation under a boundary that claims a tag its union can't have: billing's `CardDeclined` over a posts mutation. It's a no-op, not a type error, since a boundary doesn't know the calls under it; a tag no registry has is one, with TypeScript's "did you mean". Today the same claim isn't a no-op: every call's union has every built-in code, so claiming `PAYMENT_REQUIRED` takes the built-in one out, and a misspelt code compiles and owns nothing:

```tsx twoslash
// @errors: 2820
// ---cut-start---
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import {
  createErrorBoundaryE as createErrorBoundary,
  createErrorsE as createErrors,
  createTrpcContextE as createTrpcContext,
  mergeErrorsE as mergeErrors,
  scopeE as scope,
  withErrorsE as withErrors,
} from '../open/error-registry.ts';
import { t } from './server.ts';
const rootErrors = createErrors({ Unauthorized: { status: 401 } });
const postErrors = createErrors({
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
const billingErrors = createErrors({ CardDeclined: { status: 402 } });
const errors = mergeErrors(rootErrors, postErrors, billingErrors);
const appRouter = withErrors(rootErrors, {
  posts: scope(postErrors, {
    rename: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => opts.input),
  }),
  billing: scope(billingErrors, {
    charge: t.procedure.mutation(() => ({ ok: true })),
  }),
});
const [, useTrpc] = createTrpcContext<typeof appRouter>();
// ---cut-end---
const [, useBillingBoundary] = createErrorBoundary({
  name: 'Billing',
  errors,
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
  errors,
  // Not a tag of the registry
  claims: ['Unauthorised'],
  fallback: () => null,
});
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

- **An error thrown outside its scope gets past every boundary.** A posts procedure throwing billing's `CardDeclined` reaches the client rebuilt as `CardDeclined`, but no type under the boundaries has it: `Root` doesn't own it (it isn't one of tRPC's unexpected tags), and the component gets it while `error` says `PostNotFound | TitleTaken | BadResponse`, so a `matchError()` there finds no handler and throws. Today the same throw is `defined: false` and `Root` takes it. The fix is on the server: `scope()` sends a thrown tag outside its scope as `Internal`, as `.errors()` does for undeclared codes today.
- **Claims are checked against the registry, not the calls below.** Claiming `CardDeclined` over posts components is a silent no-op: the boundary is made before anything under it is known. A module's boundary can pass its module's registry (`errors: postErrors`) to narrow what it may claim.
- **Every boundary takes `errors`.** It's what checks the claims and types the fallback; a boundary from `createTrpcContext()`'s tuple could carry it instead.
- **`BadResponse` stays in every component's union** unless a boundary claims it. Today `Root`'s `unexpected: true` owns `BAD_RESPONSE`, which is `defined: false` (so today's `post.error` is `BAD_REQUEST | NOT_FOUND`); in the registry it's a required `matchError()` key, as `NetworkError` is. It could join the unexpected tags.
- **Hovers depend on how `ErrorsOf` is written.** Mapped and indexed (`{ [K in keyof R]: … }[keyof R]`, the spikes') prints `ErrorsOf<Registry<{ … }>>`; a distributive conditional over `R[keyof R]` (the stub's) prints each `RegistryError<"PostNotFound", { id: string }>`.
- **A child can re-claim a tag its parent owns**, silently, as with codes today; the child takes it first.
- **`unexpected: true` is a list of tags**, so a fallback reads `error._tag` from eleven of tRPC's failures and nothing else; a render crash still goes past it, as [error-boundary-render-errors](./error-boundary-render-errors.md) A says.
- **Not measured:** the boundary's `Exclude` by tag is one pass over a call's union, as today's by code.
