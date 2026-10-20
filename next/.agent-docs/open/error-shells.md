---
title: Should tRPC ship error shells, so a component higher in the tree owns some failures and the ones below are typed without them?
summary: Today every TanStack hook's `error` lists every failure; a shell could own `UNAUTHORIZED` or offline once, and type components below without them.
area: tanstack
recommended: B
questions: [Q24.4, Q24.5]
links:
  - kind: spike
    label: error-shells
    url: ../../spikes/error-shells/
  - kind: note
    label: error-shells
    url: ../notes/error-shells.md
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
  - kind: decision
    label: error-ownership
    url: ../decisions/error-ownership.md
  - kind: decision
    label: granular-errors
    url: ../decisions/granular-errors.md
  - kind: docs
    label: TanStack Query errors
    url: https://v12.trpc.io/v12/docs/integrations/tanstack-query#errors
---

# Should tRPC ship error shells, so a component higher in the tree owns some failures and the ones below are typed without them?

## Why it matters

`queryOptions()` and `mutationOptions()` carry each procedure's full error union, so every component's `error` lists sign-in, offline and crash errors it can do nothing about, and `matchError()` there needs their keys or `unexpected`. App-wide handling (an error boundary, `QueryCache`'s `onError`) gets React's untyped error and never narrows what a component sees. The spike (`spikes/error-shells/`, about 190 lines on TanStack Query's `throwOnError`, with DOM and type tests) shows shells need no TanStack changes; the closed union and `matchError()` they build on have shipped.

## Options

### A) Keep it as it is: no shells

Each component handles the whole union; app-wide failures go through `unexpected` or an untyped boundary.

```ts
const trpc = useTrpc();
const rename = useMutation(trpc.doc.rename.mutationOptions());
const message =
  rename.error &&
  matchError(rename.error, {
    TITLE_TAKEN: () => 'That title is taken',
    BAD_REQUEST: () => 'Check the title',
    UNAUTHORIZED: () => 'Sign in again',
    NETWORK_ERROR: () => 'You are offline',
    BAD_RESPONSE: () => 'Try again later',
    unexpected: (e) => e.message,
  });
```

- ✅ Nothing new to build, document or keep in step with TanStack
- ❌ Every component repeats the sign-in, offline and crash handling, or folds it into `unexpected`
- ❌ An app-wide error boundary gets `unknown` and narrows with `isTrpcError` by hand

### B) Shells in boundary mode

A shell owns codes (and optionally every `defined: false` error). Its hooks throw owned errors to the nearest owning `Boundary`, which renders a fallback and re-throws what it doesn't own; `error` is typed without them. A hook checks at render that its whole chain is mounted.

```ts
const RootShell = createShell({ name: 'Root', claims: [], unexpected: true, fallback: Crashed });
const OfflineShell = RootShell.extend({ name: 'Offline', claims: ['NETWORK_ERROR'], fallback: Offline });
const AuthShell = OfflineShell.extend({ name: 'Auth', claims: ['UNAUTHORIZED'], fallback: SignIn });

function RenameDoc() {
  const trpc = useTrpc();
  const rename = AuthShell.useMutation(trpc.doc.rename.mutationOptions());
  // rename.error: TITLE_TAKEN | BAD_REQUEST; the shells own the rest
  const message = rename.error && matchError(rename.error, {
    TITLE_TAKEN: () => 'That title is taken',
    BAD_REQUEST: () => 'Check the title', // no `unexpected` or link keys: Root owns them
  });
}

<RootShell.Boundary><OfflineShell.Boundary><AuthShell.Boundary>
  <RenameDoc />
</AuthShell.Boundary></OfflineShell.Boundary></RootShell.Boundary>
```

- ✅ Built and tested in the spike, including the shared `QueryErrorResetBoundary` that retry needs
- ✅ Claims go by code: a returned `UNAUTHORIZED`, a thrown one and a proxy's 401 all go to `Auth`
- ❌ The fallback replaces the subtree, so an owned mutation error unmounts the form and its local state
- ❌ Suspense hooks don't fit: `useSuspenseQuery` throws every error while it has no data

### C) Boundary mode plus a side-effect mode

As B, and a shell can instead react (a toast, a redirect, a sign-in modal) while its hooks swallow the errors it owns.

```ts
const SessionShell = RootShell.extend({
  name: 'Session',
  claims: ['UNAUTHORIZED'],
  mode: 'react', // don't throw, don't render a fallback
  onError: (error, { retry }) => openSignInModal({ onSignedIn: retry }),
});

const rename = SessionShell.useMutation(trpc.doc.rename.mutationOptions());
rename.status; // 'error'
rename.error; // null for UNAUTHORIZED; the form stays mounted
```

- ✅ Covers "session expired" without losing what the user typed
- ❌ Not spiked
- ❌ `status: 'error'` with `error: null` is new for TanStack users, and `isError` checks would misread it

### D) Primitives only

Ship the claim predicate, the `Remaining` type and the options transform that sets `throwOnError`; apps write their own boundaries. Names are illustrative.

```ts
const auth = claims({ claims: ['UNAUTHORIZED'] });
const doc = useQuery(auth.options(trpc.doc.byId.queryOptions({ id }))); // sets throwOnError
doc.error; // without UNAUTHORIZED
// your error boundary: if (!auth.owns(error)) throw error;
```

- ✅ Small, framework-free, no component API to support
- ❌ Every app rewrites the boundary, the mounted-chain check and the shared reset boundary; the spike's first run got the reset wrong

## Recommendation

**B**, with the framework-free part in `@trpc12/tanstack-query` and `createShell` in `@trpc12/tanstack-react-query` first (Q24.5 A, see Details). It's built and tested, needs nothing from TanStack, and gives a component's `error` only what it must handle. Keep the side-effect mode (C) for when a real "session expired" form needs it.

## Blocked until answered

- Nothing else is blocked: shells are additive, and `useQuery(trpc.x.queryOptions())` keeps working as it does. Porting the spike into the packages, with docs, waits on this.

## Details

**Where shells live (Q24.5), if they ship.** The claim predicate (`owns(error)`), `Remaining` and the `throwOnError` transform contain no React; each framework's boundary differs (Vue's `onErrorCaptured`, Solid's `<ErrorBoundary>`, Svelte's `<svelte:boundary>`). With D, this only picks the primitives' package.

- **A (recommended): the framework-free part in `@trpc12/tanstack-query`, `createShell` per adapter.** React first; `@trpc12/experimental-tanstack-vue-query` and the others when someone asks. Written and tested once, and other frameworks can use the primitives before their adapter has `createShell`. Two packages to keep in step for one feature.
- **B: React only, all in `@trpc12/tanstack-react-query`.** One package and the smallest surface; other adapters copy or move the code later.

```ts
// A
import { type Remaining } from '@trpc12/tanstack-query';
import { createShell } from '@trpc12/tanstack-react-query'; // re-exports the core
// B
import { createShell, type Remaining } from '@trpc12/tanstack-react-query';
```

**From the spike** ([note](../notes/error-shells.md)):

- One `QueryErrorResetBoundary` must be shared by the whole chain: with one per shell, retrying from `Offline` reset the wrong boundary and the query never refetched.
- `Remaining` subtracts `{ defined: false }` for `unexpected: true`, so a root shell takes the link codes and `unexpected` off `matchError()` below it; a `NETWORK_ERROR` claim types correctly only because the union is closed ([closed-client-errors](../decisions/closed-client-errors.md)).
- The spike's `createShell` takes `unexpected: true`, the name `matchError()`'s catch-all has had since [exhaustive-match-error](../decisions/exhaustive-match-error.md).
