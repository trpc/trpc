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

#### Error boundaries {#boundaries-a}

Today's boundary (`createErrorBoundary`, internal in `packages/tanstack-react-query`) claims codes, names no router, and hands its fallback an `error: unknown`. The spike gives it the sources the other options use ([`boundaries/codes.ts`](../../spikes/error-registry/boundaries/codes.ts)): `errorsOf<T>()` is an empty object whose type carries `T`'s errors, where `T` is the router, a subrouter, a module's declared base procedure or one procedure. Claims are then checked against v12's `ClientError` codes for that source. The sources hardly differ, because every call's union has all 25 built-in codes:

```ts twoslash
// ---cut-start---
import type { BuiltinErrorCode } from '@trpc12/trpc/client';
import { error } from '@trpc12/trpc/server';
import { z } from 'zod';
import type { CodeOf } from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);
// posts/procedure.ts: the posts module's codes, declared once
const postProcedure = authed.errors({
  NOT_FOUND: { data: z.object({ id: z.string() }) },
  TITLE_TAKEN: { status: 409 },
});
const appRouter = {
  posts: {
    byId: postProcedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
      ),
  },
  billing: {
    charge: authed
      .errors({ CARD_DECLINED: { status: 402 } })
      .mutation((opts) => opts.errors.CARD_DECLINED()),
  },
};
type AppRouter = typeof appRouter;

// Each source's codes besides the 25 built-in ones, which all four have
type FromRouter = Exclude<CodeOf<AppRouter>, BuiltinErrorCode>;
//   ^?
type FromPosts = Exclude<CodeOf<AppRouter['posts']>, BuiltinErrorCode>;
//   ^?
type FromDeclared = Exclude<CodeOf<typeof postProcedure>, BuiltinErrorCode>;
//   ^?
type FromById = Exclude<CodeOf<AppRouter['posts']['byId']>, BuiltinErrorCode>;
//   ^?
```

A boundary over the posts subtree may claim any built-in code, so the check catches a misspelt code but not a wrong one. Its fallback gets the claimed codes, and a call under it loses them, as today:

```tsx twoslash
// @errors: 2820
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { error } from '@trpc12/trpc/server';
import { z } from 'zod';
import {
  createCodeErrorBoundaryA as createCodeErrorBoundary,
  errorsOf,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);
const postProcedure = authed.errors({
  NOT_FOUND: { data: z.object({ id: z.string() }) },
  TITLE_TAKEN: { status: 409 },
});
const appRouter = {
  posts: {
    byId: postProcedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
      ),
  },
};
type AppRouter = typeof appRouter;
const [, useTrpc] = createTrpcContext<AppRouter>();
// ---cut-end---
const [RootBoundary] = createCodeErrorBoundary({
  name: 'Root',
  errors: errorsOf<AppRouter>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error.code,
});
const [, useAuthBoundary] = createCodeErrorBoundary({
  name: 'Auth',
  errors: errorsOf<AppRouter['posts']>(),
  parent: RootBoundary,
  // No posts procedure fails with PAYMENT_REQUIRED, but it's built in
  claims: ['UNAUTHORIZED', 'PAYMENT_REQUIRED'],
  fallback: (props) => props.error.code,
  //                               ^?
});

function PostTitle(props: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(
    useAuthBoundary().query(
      trpc.posts.byId.queryOptions({ input: { id: props.id } }),
    ),
  );
  post.error?.code;
  //          ^?
}

createCodeErrorBoundary({
  name: 'Typo',
  errors: errorsOf<AppRouter>(),
  claims: ['UNAUTHORISED'],
  fallback: () => null,
});
```

```tsx twoslash
// ---cut-start---
import { createErrorBoundary } from '../../../../packages/tanstack-react-query/src/error-boundary.ts';
// ---cut-end---
// Today: no source, so any string is a claim, and the error is unknown
const [, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: ['UNAUTHORISED'],
  fallback: (props) => String(props.error),
  //                                ^?
});
```

What the client gets is the internal boundary, unchanged, with the claims as written. From `node spikes/error-registry/bundle.ts` (rolldown, minified, then formatted; the names are the minifier's), for `bundle/boundary-a.ts`:

```js
// errorsOf<AppRouter['post']>(): the type is gone; the value is an empty object
Ct = () => ({});
// Auth, as written: its claims are the only strings it adds
St({
  name: `Auth`,
  errors: Ct(),
  parent: wt,
  claims: [`UNAUTHORIZED`, `NETWORK_ERROR`],
  fallback: (e) => e.error.message,
});
// The internal boundary's guard: the claims against the error's code, and
// `unexpected: true` as every `defined: false` error
n = (t) =>
  _t(t) && (e.claims.includes(t.code) || (e.unexpected === !0 && !t.defined));
```

Where A differs:

- **Codes, not tags.** The guard compares `error.code`, so a declared `NOT_FOUND` (`defined: true`) and a thrown or proxied one are the same claim. Only `defined` tells them apart, and a claim doesn't read it.
- **A source narrows custom codes only.** `TITLE_TAKEN` is claimable over posts and `CARD_DECLINED` isn't, but every built-in code is claimable over every source. Claiming `PAYMENT_REQUIRED` over posts takes the built-in out of every call under it.
- **`unexpected: true` is a flag, not a list.** It owns every `defined: false` error, thrown built-ins and `BAD_RESPONSE` among them, which is why the narrowed `post.error` has no `BAD_RESPONSE`.
- **Today's boundary takes no source.** The typed one is types over it. `errorsOf()` bundles to `() => ({})`, and nothing else is new.

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

#### Error boundaries {#boundaries-b}

A boundary names where its tags come from with `errorsOf<T>()`, an empty object whose type carries `T`'s errors ([`boundaries/sources.ts`](../../spikes/error-registry/boundaries/sources.ts)). With B, the router, a subrouter and a procedure are what their resolvers return. The registry is every error the backend has, whether anything returns it or not:

```ts twoslash
// ---cut-start---
import { z } from 'zod';
import {
  createErrorsB as createErrors,
  type ErrorsFrom,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
const errors = createErrors({
  Unauthorized: { status: 401 },
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
  CardDeclined: { status: 402 },
  RateLimited: { status: 429 },
});
const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : errors.Unauthorized(),
);
const appRouter = {
  posts: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          errors.PostNotFound({ id: opts.input.id }),
      ),
    rename: authed
      .input(z.object({ title: z.string() }))
      .mutation((opts) =>
        db.post.list().some((p) => p.title === opts.input.title)
          ? errors.TitleTaken({ title: opts.input.title })
          : db.post.create(opts.input.title),
      ),
  },
  billing: { charge: authed.mutation(() => errors.CardDeclined()) },
};
type AppRouter = typeof appRouter;

// Each source's errors as a client sees them; tRPC's failures are in all four
type FromRouter = ErrorsFrom<AppRouter>;
//   ^?
type FromPosts = ErrorsFrom<AppRouter['posts']>;
//   ^?
type FromRegistry = ErrorsFrom<typeof errors>;
//   ^?
type FromById = ErrorsFrom<AppRouter['posts']['byId']>;
//   ^?
```

The boundary is built from the source in five steps, all types:

```tsx twoslash
// @errors: 2820
// ---cut-start---
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import {
  createErrorBoundary,
  createErrorsB as createErrors,
  createTrpcContext,
  errorsOf,
  type TagOf,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
const errors = createErrors({
  Unauthorized: { status: 401 },
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
  CardDeclined: { status: 402 },
  RateLimited: { status: 429 },
});
const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : errors.Unauthorized(),
);
const appRouter = {
  posts: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          errors.PostNotFound({ id: opts.input.id }),
      ),
    rename: authed
      .input(z.object({ title: z.string() }))
      .mutation((opts) =>
        db.post.list().some((p) => p.title === opts.input.title)
          ? errors.TitleTaken({ title: opts.input.title })
          : db.post.create(opts.input.title),
      ),
  },
  billing: { charge: authed.mutation(() => errors.CardDeclined()) },
};
type AppRouter = typeof appRouter;
const [, useTrpc] = createTrpcContext<AppRouter>();
// ---cut-end---
// 1. The source: an empty object, typed with the posts subtree's errors
const posts = errorsOf<AppRouter['posts']>();

// 2. What a boundary over it can claim: those tags and tRPC's
type Claimable = TagOf<AppRouter['posts']>;
//   ^?

// 3. The claims, checked against that
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: errorsOf<AppRouter>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
});
const [, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: posts,
  parent: RootBoundary,
  claims: ['Unauthorized', 'NetworkError'],
  // 4. The fallback gets what it claims
  fallback: (props) => props.error.message,
  //                         ^?
});
createErrorBoundary({
  name: 'Typo',
  errors: posts,
  claims: ['Unauthorised'],
  fallback: () => null,
});

function Rename() {
  const trpc = useTrpc();
  // 5. A call under Auth and Root: its own union, without what they own
  const rename = useMutation(
    useAuthBoundary().mutation(trpc.posts.rename.mutationOptions()),
  );
  rename.error;
  //     ^?
}
```

None of that reaches the client. It gets the boundary as written and the internal boundary's guard, unchanged. From `node spikes/error-registry/bundle.ts` (rolldown, minified, then formatted; the names are the minifier's):

```js
// errorsOf<…>(): the type is gone; the value is an empty object
wt = () => ({});
// createErrorBoundary: `unexpected: true` becomes tRPC's ten unexpected tags (Ct), by name
function Tt(e) {
  return St({
    name: e.name,
    parent: e.parent,
    claims: e.unexpected === !0 ? [...e.claims, ...Ct] : [...e.claims],
    fallback: e.fallback,
  });
}
// Auth, as written: its claims are the only strings it adds
Tt({
  name: `Auth`,
  errors: wt(),
  parent: $,
  claims: [`Unauthorized`, `NetworkError`],
  fallback: (e) => e.error.message,
});
// The internal boundary's guard: the claims against the error's code
n = (t) =>
  yt(t) && (e.claims.includes(t.code) || (e.unexpected === !0 && !t.defined));
```

The guard is the tag check: a registry error's `code` is its tag, and `toFailure()` gives tRPC's failures their tag as `code` too. It reads `code` because the internal boundary is kept as it is. Under the proposal `code` goes, and the guard reads `_tag`.

Typed from B's registry (`bundle/boundary-b.ts`), C's classes, D's builder, E's and G's posts subtrees, F's interface, or the posts subtree of an app with no registry, a Root and an Auth boundary like these bundle to the same bytes, with none of the registry's strings.

Where B differs:

- **The registry is the widest source.** Over `errorsOf<typeof errors>()` a boundary may claim `RateLimited`, which nothing returns. That's right for a boundary that guards the whole app, and a silent no-op anywhere else.
- **Claims are checked against the source, not the calls under the boundary.** Auth over `AppRouter['posts']` can't claim `CardDeclined`. Over `AppRouter` it can, and around posts components it then owns nothing. Nothing ties a boundary to the components it wraps.
- **With `.errors(errors)` on every procedure, every source is the registry**, since each call's union is then all of it.
- **`BadResponse` stays in each call's union** unless a boundary claims it. A child can re-claim a parent's tag, silently, as with codes today.

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

#### Error boundaries {#boundaries-c}

The class list is a source like B's registry. Each class arrives as v12 sends it, with its fields as `data`, and the router knows a class only where a resolver maps it with `send()` or `expose()`:

```tsx twoslash
// @errors: 2322
// ---cut-start---
import type {} from 'effect/http-api';
import { useQuery } from '@tanstack/react-query';
import { Schema } from 'effect';
import { z } from 'zod';
import {
  createErrorBoundary,
  createTrpcContext,
  errorsOf,
  taggedErrorsC as taggedErrors,
  type ErrorsFrom,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  {},
  { httpApiStatus: 401 },
) {}
class PostNotFound extends Schema.TaggedError<PostNotFound>()(
  'PostNotFound',
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}
class CardDeclined extends Schema.TaggedError<CardDeclined>()(
  'CardDeclined',
  {},
  { httpApiStatus: 402 },
) {}
const errors = taggedErrors(Unauthorized, PostNotFound, CardDeclined);

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : errors.send(new Unauthorized()),
);
const appRouter = {
  posts: {
    byId: authed
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          errors.send(new PostNotFound({ id: opts.input.id })),
      ),
  },
  billing: {
    charge: authed.mutation(() => errors.send(new CardDeclined())),
  },
};
type AppRouter = typeof appRouter;

type FromRouter = ErrorsFrom<AppRouter>;
//   ^?
type FromPosts = ErrorsFrom<AppRouter['posts']>;
//   ^?
type FromClasses = ErrorsFrom<typeof errors>;
//   ^?
type FromById = ErrorsFrom<AppRouter['posts']['byId']>;
//   ^?

// ---cut-start---
const [, useTrpc] = createTrpcContext<AppRouter>();
// ---cut-end---
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: errorsOf<AppRouter>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
});
const [, useNotFoundBoundary] = createErrorBoundary({
  name: 'NotFound',
  errors: errorsOf<typeof errors>(),
  parent: RootBoundary,
  claims: ['PostNotFound'],
  // The fields, as data: not the class
  fallback: (props) => props.error.data.id,
  //                         ^?
});
function PostTitle(props: { id: string }) {
  const trpc = useTrpc();
  const post = useQuery(
    useNotFoundBoundary().query(
      trpc.posts.byId.queryOptions({ input: { id: props.id } }),
    ),
  );
  post.error?._tag;
  //          ^?
}

// A class isn't a claim: the client would have to import it
createErrorBoundary({
  name: 'ByClass',
  errors: errorsOf<typeof errors>(),
  claims: [PostNotFound],
  fallback: () => null,
});
```

The client gets B's bytes: typed from the class list (`bundle/boundary-c.ts`), the Auth boundary is

```js
Tt({
  name: `Auth`,
  errors: wt(),
  parent: $,
  claims: [`Unauthorized`, `NetworkError`],
  fallback: (e) => e.error.message,
});
n = (t) =>
  yt(t) && (e.claims.includes(t.code) || (e.unexpected === !0 && !t.defined));
```

and the guard compares the tag string. No class, Effect Schema or field reaches the client.

Where C differs:

- **Claims are strings, not classes.** A class on the client means bundling it and Effect Schema, so `instanceof` and `Schema.is` are out there. The class's tag is the claim.
- **The fallback's `error` is v12's error with the fields as `data`.** It has no class methods and fails `instanceof`.
- **The router knows a class only once a resolver maps it.** A raw class is the "Map Effect failures to a TrpcError" type error before it reaches any boundary. With the `packages/` change in Details it would be a public error and the router would carry it directly, still not as a class.
- **The class list is the whole backend's source**, as B's registry is, with the same no-op claims for classes nothing returns.

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

#### Error boundaries {#boundaries-d}

A builder is a source as it is: its methods are dropped and its entries read like B's registry. `extend()` gives each module a builder of its own, so a module is a source too:

```tsx twoslash
// @errors: 2322
// ---cut-start---
import { z } from 'zod';
import {
  createErrorBoundary,
  errorsD as errors,
  errorsOf,
  registryOfD as registryOf,
  type ErrorsFrom,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
const authErrors = errors().add('Unauthorized', { status: 401 });
const postErrors = errors()
  .add('PostNotFound', { status: 404, data: z.object({ id: z.string() }) })
  .add('TitleTaken', { status: 409 });
const appErrors = errors().extend(authErrors).extend(postErrors);

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : authErrors.Unauthorized(),
);
const postProcedure = authed.errors(registryOf(postErrors));
const appRouter = {
  posts: {
    byId: postProcedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          postErrors.PostNotFound({ id: opts.input.id }),
      ),
  },
  me: authed.query((opts) => opts.ctx.user),
};
type AppRouter = typeof appRouter;

type FromRouter = ErrorsFrom<AppRouter>;
//   ^?
type FromPosts = ErrorsFrom<AppRouter['posts']>;
//   ^?
type FromBuilder = ErrorsFrom<typeof appErrors>;
//   ^?
type FromModule = ErrorsFrom<typeof postErrors>;
//   ^?
type FromById = ErrorsFrom<AppRouter['posts']['byId']>;
//   ^?

const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: errorsOf<typeof appErrors>(),
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
});
createErrorBoundary({
  name: 'Posts',
  errors: errorsOf<typeof postErrors>(),
  parent: RootBoundary,
  // The auth module's tag, on a boundary over the posts module's builder
  claims: ['Unauthorized'],
  fallback: () => null,
});
```

The client gets B's bytes. Typed from the builder (`bundle/boundary-d.ts`), the Auth boundary is

```js
Tt({
  name: `Auth`,
  errors: wt(),
  parent: $,
  claims: [`Unauthorized`, `NetworkError`],
  fallback: (e) => e.error.message,
});
n = (t) =>
  yt(t) && (e.claims.includes(t.code) || (e.unexpected === !0 && !t.defined));
```

Where D differs:

- **The builder is a source; `.errors()` needs `registryOf()`.** The boundary reads the builder's entries and drops `add` and `extend`, but v12's `.errors()` would read the methods as error specs.
- **A module builder (`postErrors`) leaves out its middleware's errors.** The posts boundary above can't claim `Unauthorized`, though every posts call can fail with it. `errorsOf<typeof postProcedure>()` has both, as in E.
- **Otherwise it's B:** the same five steps, the same claims checked against a source rather than the calls, and the same bytes.

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
- ✅ Error boundaries claim tags checked against the type of a router, a subtree, a module's declaration or one procedure, and a fallback's `error` is what it claims. The client gets the claims as strings and nothing else ([Error boundaries](#boundaries-e)).
- ✅ One registry is the one-module case, so B is E without `mergeErrors()`. A module without a declaration infers, as B and G do.
- ❌ A module's union, not a procedure's: `post.byId` handles `TitleTaken`. That's the declaration's point (OpenAPI, the contract), and a procedure that wants its own union leaves `.errors()` off.
- ❌ Middleware errors aren't checked against a declaration (v12's rule), so `Unauthorized` is in every authed call's union whatever the module declares.
- ❌ 700,634 instantiations on the server and 2,205,120 with the client: 23% over B and 4% over today. Each call matches its module's 8 errors, and `DeclaredCheck` runs on every resolver.

#### Error boundaries {#boundaries-e}

E has two more sources than B: a module's registry, and its base procedure, which adds the module's middleware errors to what it declares. Every posts procedure's union is the posts module's declaration, so the subtree, the base procedure and each procedure agree:

```ts twoslash
// ---cut-start---
import { z } from 'zod';
import {
  createErrorsE as createErrors,
  type ErrorsFrom,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
const authErrors = createErrors({
  Unauthorized: { status: 401 },
  Forbidden: { status: 403 },
});
const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
const billingErrors = createErrors({ CardDeclined: { status: 402 } });

const authed = t.procedure.use((opts) => {
  if (!opts.ctx.user) return authErrors.Unauthorized();
  if (opts.ctx.user.name === 'guest') return authErrors.Forbidden();
  return opts.next({ ctx: { user: opts.ctx.user } });
});
const postProcedure = authed.errors(postErrors);
const appRouter = {
  posts: {
    byId: postProcedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          postErrors.PostNotFound({ id: opts.input.id }),
      ),
  },
  billing: {
    charge: authed
      .errors(billingErrors)
      .mutation(() => billingErrors.CardDeclined()),
  },
};
type AppRouter = typeof appRouter;

type FromRouter = ErrorsFrom<AppRouter>;
//   ^?
type FromPosts = ErrorsFrom<AppRouter['posts']>;
//   ^?
// The module's registry, without its middleware's errors
type FromModule = ErrorsFrom<typeof postErrors>;
//   ^?
// The module's base procedure: its middleware's and what it declares
type FromDeclared = ErrorsFrom<typeof postProcedure>;
//   ^?
type FromById = ErrorsFrom<AppRouter['posts']['byId']>;
//   ^?
```

Three nested boundaries, typed from the router. A fallback's `error` is what its boundary claims:

```tsx twoslash
// ---cut-start---
import { z } from 'zod';
import {
  createErrorBoundary,
  createErrorsE as createErrors,
  errorsOf,
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
// ---cut-end---
const app = errorsOf<AppRouter>();

const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: app,
  claims: [],
  unexpected: true,
  fallback: (props) => props.error._tag,
  //                               ^?
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  errors: app,
  parent: RootBoundary,
  claims: ['NetworkError'],
  fallback: () => 'You are offline',
});
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: app,
  parent: OfflineBoundary,
  claims: ['Unauthorized', 'Forbidden'],
  fallback: (props) => `Sign in: ${props.error.message}`,
  //                                     ^?
});
```

A query under `<AuthBoundary>`, which sits in `Offline` and `Root`, loses what the three own. A `matchError()` below it takes `PostNotFound`, `TitleTaken` and `BadResponse`, and no `unexpected`. Today's version, with codes, follows it:

```tsx twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  createErrorBoundary,
  createErrorsE as createErrors,
  createTrpcContext,
  errorsOf,
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
const app = errorsOf<AppRouter>();
const [, useTrpc] = createTrpcContext<AppRouter>();
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: app,
  claims: [],
  unexpected: true,
  fallback: () => null,
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  errors: app,
  parent: RootBoundary,
  claims: ['NetworkError'],
  fallback: () => null,
});
const [, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: app,
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
// Today: every built-in code, and `unexpected` takes the defined: false ones
function PostTitle(props: { id: string }) {
  const trpc = useTrpc();
  const options = trpc.post.byId.queryOptions({ input: { id: props.id } });

  const post = useQuery(useAuthBoundary().query(options));
  post.error?.code;
  //          ^?
}
```

Which source a boundary takes decides what it may claim, and only that. A billing boundary over posts components is a no-op, not a type error, because a boundary doesn't know the calls under it. Three things are type errors:

- a tag no source names;
- a tag outside the source a module's boundary names (`errorsOf<AppRouter['posts']>()`, or its registry);
- a posts resolver returning `CardDeclined` in the first place.

```tsx twoslash
// @errors: 2820 2322
// ---cut-start---
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import {
  createErrorBoundary,
  createErrorsE as createErrors,
  createTrpcContext,
  errorsOf,
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
const [, useTrpc] = createTrpcContext<AppRouter>();
// ---cut-end---
const [, useBillingBoundary] = createErrorBoundary({
  name: 'Billing',
  errors: errorsOf<AppRouter>(),
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
  errors: errorsOf<AppRouter>(),
  claims: ['Unauthorised'],
  fallback: () => null,
});

createErrorBoundary({
  name: 'Posts',
  errors: errorsOf<typeof postProcedure>(),
  // Billing's tag, on a boundary over the posts module's declaration
  claims: ['CardDeclined'],
  fallback: () => null,
});

// And a posts resolver can't return it in the first place
postProcedure.mutation(() => billingErrors.CardDeclined());
```

The client gets B's bytes. Typed from E's posts subtree (`bundle/boundary-e.ts`), the Auth boundary is

```js
Tt({
  name: `Auth`,
  errors: wt(),
  parent: $,
  claims: [`Unauthorized`, `NetworkError`],
  fallback: (e) => e.error.message,
});
n = (t) =>
  yt(t) && (e.claims.includes(t.code) || (e.unexpected === !0 && !t.defined));
```

which is the same bytes as for an app with no registry (`bundle/boundary-plain.ts`).

Where E differs, and what's rough:

- **A module's registry and its base procedure are different sources.** The registry leaves out the middleware's errors (no `Unauthorized`), and the base procedure has them. A module's boundary usually wants the base procedure.
- **Declared unions are module-sized,** so a boundary over `posts.byId` may claim `TitleTaken`, which only `rename` returns. That's the declaration's point (OpenAPI, the contract), and a procedure that wants its own union leaves `.errors()` off.
- **The earlier draft's leak is gone.** A posts procedure can't return billing's `CardDeclined`. If it throws it, the error is undeclared, so v12 sends `INTERNAL_SERVER_ERROR` and `Root` shows `Internal`.
- **Claims are checked against the source, not the calls below.** The billing boundary above is a silent no-op around posts components. Naming the subtree or the module narrows what a boundary may claim, not where it's mounted.
- **Every boundary names a source.** It's type-only (`errorsOf()` bundles to `() => ({})`), and a boundary from `createTrpcContext()`'s tuple could carry it instead. A router source is a walk of the router (`inferRouterErrors`) per boundary, which isn't measured at 1,500 procedures; a module's registry or base procedure isn't a walk.
- **`BadResponse` stays in every component's union** unless a boundary claims it. Today `Root`'s `unexpected: true` owns `BAD_RESPONSE`, which is `defined: false`. Here it's a required `matchError()` key, as `NetworkError` is. It could join the unexpected tags.
- **`unexpected: true` is a list of tags**, so a fallback reads `error._tag` from ten of tRPC's failures and nothing else. A render crash still goes past it, as [error-boundary-render-errors](./error-boundary-render-errors.md) A says.

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

#### Error boundaries {#boundaries-f}

F's interface is a source that needs no router type: every tag every module registered, in the whole TypeScript program. The router, a subrouter and a procedure are still what their resolvers return:

```tsx twoslash
// ---cut-start---
import { z } from 'zod';
import {
  createErrorBoundary,
  createErrorsF as createErrors,
  errorsOf,
  type Errors,
  type ErrorsFrom,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
// posts/errors.ts
export const postErrors = createErrors({
  PostNotFound: { status: 404, data: z.object({ id: z.string() }) },
  TitleTaken: { status: 409, data: z.object({ title: z.string() }) },
});
type PostErrors = typeof postErrors;
// '@trpc12/trpc' in the real API
declare module '../open/error-registry.ts' {
  interface Errors extends PostErrors {}
}

const appRouter = {
  posts: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          postErrors.PostNotFound({ id: opts.input.id }),
      ),
  },
};
type AppRouter = typeof appRouter;

// Every registered tag, with no router type
type FromInterface = ErrorsFrom<Errors>;
//   ^?
type FromRouter = ErrorsFrom<AppRouter>;
//   ^?
type FromPosts = ErrorsFrom<AppRouter['posts']>;
//   ^?
type FromById = ErrorsFrom<AppRouter['posts']['byId']>;
//   ^?

// A design system's boundary, which can't import AppRouter: TitleTaken is
// registered, though nothing returns it
const [, useConflictBoundary] = createErrorBoundary({
  name: 'Conflict',
  errors: errorsOf<Errors>(),
  claims: ['TitleTaken'],
  fallback: (props) => `${props.error.data.title} is taken`,
  //                            ^?
});
```

The client gets B's bytes. Typed from the interface (`bundle/boundary-f.ts`), the Auth boundary is

```js
Tt({
  name: `Auth`,
  errors: wt(),
  parent: $,
  claims: [`Unauthorized`, `NetworkError`],
  fallback: (e) => e.error.message,
});
n = (t) =>
  yt(t) && (e.claims.includes(t.code) || (e.unexpected === !0 && !t.defined));
```

Where F differs:

- **Global.** One interface per TypeScript program: two backends in a monorepo share it, and a boundary in one app may claim the other's tags.
- **Registered isn't returned.** Claims are checked against every registration, so a claim nothing returns compiles everywhere, wider than B's registry because it spans packages.
- **It's the one source without a router type,** for a package that can't import `AppRouter` (a design system's boundaries). That's all F is for now.
- **A call's narrowed `error` still comes from its procedure,** as in every option: the interface types claims and fallbacks, not calls.

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

#### Error boundaries {#boundaries-g}

With nothing listing G's errors, the router is the only source for the whole backend, and a tag is in it only while some procedure returns it. A single error, or an `.errors()` map of them, is the narrowest source:

```tsx twoslash
// @errors: 2322
// ---cut-start---
import { z } from 'zod';
import {
  createErrorBoundary,
  defineErrorG as defineError,
  errorsOf,
  type ErrorsFrom,
} from '../open/error-registry.ts';
import { db, t } from './server.ts';
// ---cut-end---
const Unauthorized = defineError('Unauthorized', { status: 401 });
const PostNotFound = defineError('PostNotFound', {
  status: 404,
  data: z.object({ id: z.string() }),
});
// Defined, but no procedure returns it yet
const RateLimited = defineError('RateLimited', { status: 429 });

const authed = t.procedure.use((opts) =>
  opts.ctx.user ? opts.next({ ctx: { user: opts.ctx.user } }) : Unauthorized(),
);
// Declared without a registry: returns are restricted all the same
const postProcedure = authed.errors({ PostNotFound });
const appRouter = {
  posts: {
    byId: postProcedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ?? PostNotFound({ id: opts.input.id }),
      ),
  },
};
type AppRouter = typeof appRouter;

type FromRouter = ErrorsFrom<AppRouter>;
//   ^?
type FromPosts = ErrorsFrom<AppRouter['posts']>;
//   ^?
type FromDeclared = ErrorsFrom<typeof postProcedure>;
//   ^?
type FromById = ErrorsFrom<AppRouter['posts']['byId']>;
//   ^?
type FromOneError = ErrorsFrom<typeof PostNotFound>;
//   ^?

// RateLimited isn't claimable until a procedure returns it
createErrorBoundary({
  name: 'Throttled',
  errors: errorsOf<AppRouter>(),
  claims: ['RateLimited'],
  fallback: () => null,
});
// Over one error, a boundary claims that one
const [, useNotFoundBoundary] = createErrorBoundary({
  name: 'NotFound',
  errors: errorsOf<typeof PostNotFound>(),
  claims: ['PostNotFound'],
  fallback: (props) => `No post ${props.error.data.id}`,
  //                                    ^?
});
```

The client gets B's bytes. Typed from G's posts subtree (`bundle/boundary-g.ts`), the Auth boundary is

```js
Tt({
  name: `Auth`,
  errors: wt(),
  parent: $,
  claims: [`Unauthorized`, `NetworkError`],
  fallback: (e) => e.error.message,
});
n = (t) =>
  yt(t) && (e.claims.includes(t.code) || (e.unexpected === !0 && !t.defined));
```

Where G differs:

- **Inferred only.** A boundary written before the procedure that returns its tag doesn't compile, and removing the last return breaks the claim. With a registry (B, E), the claim stands while the error is declared.
- **No list of the backend's errors.** The router walk is the whole-backend source, and nothing catches two modules defining one tag.
- **The narrowest sources are G's own:** one error (`errorsOf<typeof PostNotFound>()`) or an `.errors()` map of them.

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
  - Error boundaries (a Root and an Auth boundary) typed from B's registry, C's classes, D's builder, E's and G's posts subtrees, F's interface, or the posts subtree of an app with no registry: the same bytes, 19.1 kB, 7.2 kB gzip with the internal boundary they wrap, and none of the registry's strings. A's, by code: 18.9 kB, 7.1 kB gzip.
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
