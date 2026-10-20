---
title: Should a boundary list the codes it owns, or take the error map the server declares them with?
summary: "Today `claims: ['UNAUTHORIZED']` lists codes; result-rpc shares one error map between the server's middleware and the shell that owns it."
area: tanstack
recommended: A
links:
  - kind: code
    label: error-boundary.ts (internal)
    url: ../../packages/tanstack-react-query/src/error-boundary.ts
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
---

# Should a boundary list the codes it owns, or take the error map the server declares them with?

## Why it matters

A boundary owns errors by code, whatever `defined` says, so a returned `UNAUTHORIZED`, a thrown one and a proxy's 401 all go to `<AuthBoundary>`. The codes are strings, so a typo (`'UNAUTHORISED'`) owns nothing and nothing says so. result-rpc's shells claim a shared error map instead, the same object its server middleware declares with, so the two can't drift. An error's `_tag` is its code today ([error-tags](../decisions/error-tags.md)), so a list of codes is a list of tags as well.

## Options

### A) Keep it: a list of codes

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryA as createErrorBoundary } from '../open/error-boundary-claims.ts';
declare function SignIn(props: { reset: () => void }): null;
// ---cut-end---
const [AuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: ['UNAUTHORIZED', 'FORBIDDEN'],
  fallback: SignIn,
});
```

- ✅ Built; the same strings as `matchError()`'s keys and `Effect.catchTag()`'s tags
- ✅ Covers what nothing declares: link codes (`NETWORK_ERROR`) and a proxy's statuses
- ❌ A misspelt code claims nothing, silently

### B) The server's error map

The object a middleware passes to `.errors()`, shared by the server and the boundary; a code nothing declares, like a link's, is `true`.

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryB as createErrorBoundary } from '../open/error-boundary-claims.ts';
import { t } from './server.ts';
declare function SignIn(props: { reset: () => void }): null;
declare function Offline(props: { reset: () => void }): null;
// ---cut-end---
// errors.ts, imported by both
export const authErrors = {
  UNAUTHORIZED: { message: 'Sign in to continue' },
  FORBIDDEN: { message: 'Not yours' },
};

// server
const authed = t.procedure.errors(authErrors);

// client
const [AuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: authErrors,
  fallback: SignIn,
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  claims: { NETWORK_ERROR: true },
  fallback: Offline,
});
```

- ✅ One declaration for the server and the boundary that owns its errors
- ❌ The client imports a module the server's middleware also imports, so it has to stay free of server code
- ❌ The boundaries that matter most own codes nothing declares (`NETWORK_ERROR`, a proxy's `UNAUTHORIZED`), so most claims are `true` anyway, and a misspelt one still claims nothing

## Recommendation

**A.** A boundary's job is to own failures that come from anywhere (the network, a proxy, a middleware), and those are codes, not declarations; a code is also what `matchError()` and `catchTag()` take. Catch the typo instead: type `claims` with the codes the client can fail with (every built-in code, plus the router's declared ones), which a later version can add without changing the shape.

## Blocked until answered

- Nothing else. The built shape is A, so the public export can ship with A and B added later; only typing `claims` against the router changes the signature, by adding a type parameter.

## Details

- **Tags.** If built-in errors get a tag of their own ([effect-catch-tag-built-in-errors](./effect-catch-tag-built-in-errors.md), C), `_tag` stops telling `UNAUTHORIZED` from `NETWORK_ERROR` for them, so claims stay codes either way.
- **Typo checks.** `createTrpcContext<typeof router>()` knows the router, `unstable_createErrorBoundary()` doesn't. Checking claims against the router means `createErrorBoundary<typeof router>()`, or taking the boundary from the context's tuple; checking against built-in codes plus `string` catches nothing. Neither is built.
- **The key's name.** `claims` is result-rpc's word, and the docs say a boundary "owns" the codes it claims. `catches` would read like TanStack Router's `CatchBoundary` and `onCatch`; the recommendation keeps `claims`.
