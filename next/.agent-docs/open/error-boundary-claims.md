---
title: Should a boundary own errors by code, by tag, or both?
summary: "Owning `NOT_FOUND` takes a stale client's `ProcedureNotFound` and the procedure's own `NOT_FOUND` together; a tag takes one of them."
area: tanstack
recommended: C
links:
  - kind: code
    label: error-boundary.ts (internal)
    url: ../../packages/tanstack-react-query/src/error-boundary.ts
  - kind: decision
    label: error-boundaries
    url: ../decisions/error-boundaries.md
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
---

# Should a boundary own errors by code, by tag, or both?

## Why it matters

A boundary owns errors by code today, whatever `defined` says, so a returned `UNAUTHORIZED`, a thrown one and a proxy's 401 all go to `<AuthBoundary>`. Since every distinct failure got its own `_tag` ([error-tags](../decisions/error-tags.md)), a code is a group: `NOT_FOUND` is the procedure's declared `NotFound` (or a class like `PostMissing`) and the built-in `ProcedureNotFound` a client gets when it's newer than the server. A "reload the page" boundary wants the second and must leave the first to the component. result-rpc's shells claim tags; `matchError()` and `switch` take codes.

## Options

### A) Keep it: codes

```tsx twoslash
// @errors: 2367
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createErrorBoundaryA as createErrorBoundary } from '../open/error-boundary-claims.ts';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  doc: {
    byId: t.procedure
      .errors({ NOT_FOUND: { message: 'No such doc' } })
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Hello' })),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
declare function Reload(props: { reset: () => void }): null;
// ---cut-end---
const [StaleBoundary, useStaleBoundary] = createErrorBoundary({
  name: 'Stale',
  claims: ['NOT_FOUND'], // a missing procedure, and every missing doc
  fallback: Reload,
});

const trpc = useTrpc();
const doc = useQuery(
  useStaleBoundary().query(trpc.doc.byId.queryOptions({ input: { id: '1' } })),
);
// The doc's own NOT_FOUND is gone too, so the check is a type error
if (doc.error?.code === 'NOT_FOUND') {
}
```

- ✅ Built; the same strings as `matchError()`'s keys and `switch (err.code)`, and one code covers a failure from anywhere (a proxy's 401 has no tag but its code's)
- ❌ Can't own a stale client without also owning the procedure's own `NOT_FOUND`

### B) Tags

```tsx twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createErrorBoundaryB as createErrorBoundary } from '../open/error-boundary-claims.ts';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  doc: {
    byId: t.procedure
      .errors({ NOT_FOUND: { message: 'No such doc' } })
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Hello' })),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
declare function Reload(props: { reset: () => void }): null;
// ---cut-end---
const [StaleBoundary, useStaleBoundary] = createErrorBoundary({
  name: 'Stale',
  claims: ['ProcedureNotFound', 'ProcedureTypeMismatch'],
  fallback: Reload,
});

const trpc = useTrpc();
const doc = useQuery(
  useStaleBoundary().query(trpc.doc.byId.queryOptions({ input: { id: '1' } })),
);
if (doc.error?.code === 'NOT_FOUND') {
  doc.error._tag; // the doc's own NOT_FOUND is left
  //        ^?
}
```

- ✅ Exact: one failure each, the way Effect code catches them with `catchTag`
- ❌ Owning a whole class means listing its tags: `Unauthorized` covers a returned and a proxy's 401, but `NOT_FOUND`'s tags grow with each declared class (`PostMissing`, `UserMissing`)
- ❌ Promise users meet codes everywhere else (`matchError()`, `switch`), and tags only here

### C) Either, in one list

A claim matches an error's code or its tag. They can't be confused: built-in codes are `SCREAMING_CASE` and tags `PascalCase`, and a custom code is its own tag.

```tsx twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createErrorBoundaryC as createErrorBoundary } from '../open/error-boundary-claims.ts';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  doc: {
    byId: t.procedure
      .errors({ NOT_FOUND: { message: 'No such doc' } })
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Hello' })),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
declare function Reload(props: { reset: () => void }): null;
// ---cut-end---
const [AppBoundary, useAppBoundary] = createErrorBoundary({
  name: 'App',
  claims: ['UNAUTHORIZED', 'NETWORK_ERROR', 'ProcedureNotFound'],
  fallback: Reload,
});

const trpc = useTrpc();
const doc = useQuery(
  useAppBoundary().query(trpc.doc.byId.queryOptions({ input: { id: '1' } })),
);
if (doc.error?.code === 'NOT_FOUND') {
  doc.error._tag; // the doc's own NOT_FOUND is left
  //        ^?
}
```

- ✅ Codes for classes (`UNAUTHORIZED` from anywhere), tags for one failure (`ProcedureNotFound`), so each boundary says what it means
- ❌ Two kinds of string in one list, and a reader has to know which is which
- ❌ A little more type-checking per claim: `Remaining` subtracts both shapes

## Recommendation

**C.** App-wide boundaries mostly own classes (signed out, offline), which codes say best and which cover failures that only have a code. The new tags are what make a "reload" boundary possible, and it needs exactly one of them. One list keeps it one option, and the casing already tells codes and tags apart in the rest of the API.

## Blocked until answered

- Nothing else. The built shape is A, which C extends; the public export can ship with A and add tags later without breaking a claim.

## Details

- **A misspelt claim** owns nothing, silently, in every option. `unstable_createErrorBoundary()` doesn't know the router, so it can't check claims against it; `createErrorBoundary<typeof router>()` could, or a boundary created from `createTrpcContext()`'s tuple. Not built.
- **The server's error map** (result-rpc shares one between its middleware and the shell): `claims: authErrors`, the object passed to `.errors(authErrors)`. It can't name what nothing declares (`NETWORK_ERROR`, a proxy's 401), which are what app-wide boundaries own most, so it isn't an option here.
- **The key's name.** `claims` is result-rpc's word, and the docs say a boundary "owns" what it claims. `catches` would read like TanStack Router's `CatchBoundary` and `onCatch`; this keeps `claims`.
