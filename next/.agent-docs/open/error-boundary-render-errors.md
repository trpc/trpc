---
title: "Should a boundary with `unexpected: true` also catch errors that aren't tRPC's, like a crash while rendering?"
summary: "Today `<RootBoundary>` takes only tRPC errors, so a `TypeError` in a component goes past it to the app's own error boundary."
area: tanstack
recommended: B
links:
  - kind: code
    label: error-boundary.ts (internal)
    url: ../../packages/tanstack-react-query/src/error-boundary.ts
  - kind: decision
    label: error-boundaries
    url: ../decisions/error-boundaries.md
  - kind: decision
    label: exhaustive-match-error
    url: ../decisions/exhaustive-match-error.md
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
---

# Should a boundary with `unexpected: true` also catch errors that aren't tRPC's, like a crash while rendering?

## Why it matters

`unexpected: true` owns every tRPC error with `defined: false`: crashes on the server, masked errors, bad responses, link codes nothing else claims. A throw that isn't a tRPC error (a `TypeError` in a component, a failed lazy import) goes past every boundary, so an app still needs react-error-boundary or its router's boundary above the root one. This also decides each fallback's `error` type, which is `unknown` today: a boundary that only takes tRPC errors can type it with what it owns. In `matchError()`, `unexpected` is the one key for everything without its own handler ([exhaustive-match-error](../decisions/exhaustive-match-error.md)).

## Options

### A) Keep it: only tRPC errors, with typed fallbacks

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryA as createErrorBoundary } from '../open/error-boundary-render-errors.ts';
// ---cut-end---
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: (props) => props.error.code,
  //                         ^?
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  claims: ['NETWORK_ERROR'],
  fallback: (props) => props.error.message,
  //                         ^?
});
// A TypeError while rendering goes past both, to the app's own error boundary
```

- ✅ Built; every fallback's `error` is a tRPC error it can read without `isTrpcError()`
- ✅ What these boundaries do stays about tRPC calls, and the app's own boundary keeps doing what it does
- ❌ Two boundaries at the root, and a crash in a component looks different from a crash on the server

### B) `unexpected: true` takes everything no other boundary owns

As `matchError()`'s `unexpected`: a boundary with it renders its fallback for any throw that reaches it. A framework's control-flow error (Next's `redirect()` and `notFound()`, which carry a `digest`) is re-thrown, as `safe()` already does. Other boundaries' fallbacks are typed as in A; the unexpected one's `error` is `unknown`.

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryB as createErrorBoundary } from '../open/error-boundary-render-errors.ts';
// ---cut-end---
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: (props) => String(props.error),
  //                                ^?
});
const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  claims: ['NETWORK_ERROR'],
  fallback: (props) => props.error.message,
  //                         ^?
});
// A TypeError while rendering shows Root's fallback
```

- ✅ One boundary at the root for "something went wrong", whatever went wrong, and `unexpected` means what it means in `matchError()`
- ❌ The root fallback's `error` is `unknown`, and reads a tRPC error with `isTrpcError()`
- ❌ Not built: the control-flow check moves into the boundary

### C) A separate flag for everything else

`unexpected: true` stays tRPC's undefined errors, typed as in A; `everything: true` (name to pick) also takes what isn't tRPC's.

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryC as createErrorBoundary } from '../open/error-boundary-render-errors.ts';
// ---cut-end---
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  claims: [],
  unexpected: true,
  everything: true,
  fallback: (props) => String(props.error),
  //                                ^?
});
```

- ✅ Each app picks, and a typed root fallback stays possible
- ❌ Two flags whose difference has to be explained, for a choice most apps make the same way

## Recommendation

**B.** The root boundary is where an app says "something went wrong", and an app shouldn't need a second library to cover the half that isn't a tRPC call. It matches `matchError()`'s catch-all, so one word means one thing. Typed fallbacks stay for every boundary that claims codes, which is where reading the error matters: `<SignIn>` and `<Offline>` read a typed error, `<Crashed>` usually just reports it.

## Blocked until answered

- The public export's fallback props type, and its docs page.

## Details

- In every option, a boundary with codes gets `TrpcError<'NETWORK_ERROR', unknown>`: a claim matches by code whether the error is defined or not, so its `data` is whatever the procedure declared, or `undefined`.
- A fallback only ever gets its own claims; what its parents own goes to them. So a fallback's type is its own codes, not the chain's.
- A thrown promise (Suspense) never reaches an error boundary, so B needs no check for it.
