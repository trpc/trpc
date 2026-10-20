---
title: Should `<AuthBoundary>` take react-error-boundary's `resetKeys`, `onReset` and `onError` as props, or keep everything in `createErrorBoundary()`?
summary: "Today `<AuthBoundary>` takes only `children`, so it can't reset itself when the session changes or report what it caught where it's mounted."
area: tanstack
recommended: B
links:
  - kind: code
    label: error-boundary.ts (internal)
    url: ../../packages/tanstack-react-query/src/error-boundary.ts
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
---

# Should `<AuthBoundary>` take react-error-boundary's `resetKeys`, `onReset` and `onError` as props, or keep everything in `createErrorBoundary()`?

## Why it matters

What a boundary owns has to be in `createErrorBoundary()`, since the types below it are computed from it. Everything else could be a prop. Today it's all in the factory, and the component takes only `children`. react-error-boundary's `<ErrorBoundary>` takes it all as props: `fallback` (an element), `FallbackComponent`, `fallbackRender`, `onError(error, info)`, `onReset(details)` and `resetKeys`. TanStack Router's `CatchBoundary` takes `errorComponent`, `onCatch(error, errorInfo)` and `getResetKey`. result-rpc's shells take `onError` in their definition.

## Options

### A) Keep it: only `children`

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryA as createErrorBoundary } from '../open/error-boundary-props.ts';
declare function SignIn(props: { reset: () => void }): null;
declare function DocTitle(props: { id: string }): null;
// ---cut-end---
const [AuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});

<AuthBoundary>
  <DocTitle id="1" />
</AuthBoundary>;
```

- ✅ Built; one place says everything about a boundary, and every mount behaves the same
- ❌ No reset when something outside changes: signing in from another tab leaves `<SignIn>` showing until it's clicked
- ❌ Reporting owned errors to an error tracker goes in each fallback, or in `QueryCache`'s `onError`, which doesn't know which boundary took them

### B) The factory keeps what the types need and the fallback; the component takes react-error-boundary's props

`resetKeys`, `onReset` and `onError` are props with react-error-boundary's names and signatures. `fallback` can be overridden per mount.

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryB as createErrorBoundary } from '../open/error-boundary-props.ts';
declare function SignIn(props: { reset: () => void }): null;
declare function DocTitle(props: { id: string }): null;
declare function useSession(): { userId: string | undefined };
declare function report(
  error: unknown,
  componentStack: string | null | undefined,
): void;
// ---cut-end---
const [AuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});

function Page() {
  const session = useSession();
  return (
    <AuthBoundary
      resetKeys={[session.userId]} // signing in anywhere resets it
      onReset={(details) => details.reason}
      //                            ^?
      onError={(error, info) => report(error, info.componentStack)}
    >
      <DocTitle id="1" />
    </AuthBoundary>
  );
}
```

- ✅ The props React developers already know, under the names they know, and `resetKeys` covers "reset when the session or route changes"
- ✅ Additive: a boundary without props behaves as in A
- ❌ Two places to look for a boundary's behaviour
- ❌ Not built: `resetKeys` needs the class component to compare keys after each render, as react-error-boundary's does

### C) Everything but what it owns as props, as react-error-boundary does

```tsx twoslash
// ---cut-start---
import { createErrorBoundaryC as createErrorBoundary } from '../open/error-boundary-props.ts';
declare function SignIn(props: { reset: () => void }): null;
declare function DocTitle(props: { id: string }): null;
// ---cut-end---
const [AuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
});

<AuthBoundary fallback={SignIn}>
  <DocTitle id="1" />
</AuthBoundary>;
```

- ✅ Closest to react-error-boundary: a fallback per place, as a page's and a widget's differ
- ❌ Every mount repeats the fallback, and forgetting it is a type error at each one rather than once
- ❌ The same boundary renders different things in different places, so what a component's hook throws to depends on where it's mounted

## Recommendation

**B.** The factory stays the one place that says what a boundary owns and what it shows, and the props are the per-place knobs react-error-boundary made familiar, with the same names, so `resetKeys={[userId]}` needs no docs. `fallback` stays a component (`(props) => ReactNode`) as built, which TanStack Router's `errorComponent` also is; react-error-boundary's element-valued `fallback` and its `FallbackComponent`/`fallbackRender` split aren't copied.

## Blocked until answered

- The public export and its docs page: the component's props are part of both.

## Details

- `onReset`'s `reason` is `'reset'` (the fallback called `reset()`) or `'keys'` (a `resetKeys` entry changed), react-error-boundary's `'imperative-api'` under the fallback's own name.
- `onError(error, info)` gets React's `ErrorInfo`, so `info.componentStack` is there, as react-error-boundary's and React 19's root `onCaughtError` do. It runs for the errors this boundary renders, not the ones it re-throws.
- TanStack Router's `getResetKey` is one function returning one key; react-error-boundary's `resetKeys` array is the more common shape in React apps.
