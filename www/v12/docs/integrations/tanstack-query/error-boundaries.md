---
title: Error boundaries
description: '`createErrorBoundary` claims errors by code or tag for a subtree, with a fallback per claim typed by exactly what it gets, and types the queries and mutations under it without them.'
section: Integrations
parent: integrations/tanstack-query
order: 13
stability: unstable
---

A type-safe error boundary owns some of the router's errors for the tree under it: being signed out, being offline, a crash. It renders a fallback for each of them, typed by exactly the errors that fallback gets, and the queries and mutations under it type their `error` without them, so a component only handles what's left. `createErrorBoundary` is in `@trpc12/tanstack-react-query`.

Inspired by [Result RPC](https://result-rpc.com/) ([GitHub](https://github.com/jokull/result-rpc)), whose [shells](https://result-rpc.com/concepts/shells/) are error boundaries that claim failures and take them out of a component's error type.

## Define the boundaries

`createErrorBoundary` returns `[Boundary, useBoundary]`, to name as you like. `errors` says what the errors come from, for the types only: the function that makes the client (as `createTrpcContext` takes it), a client, or `routerType<AppRouter>()`. `claims` has a fallback per code or tag the boundary owns, and each fallback's `error` is typed by its claim, so a misspelt claim is a type error:

```tsx twoslash
// ---cut-start---
import { createErrorBoundary } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
declare function Crashed(props: { onRetry: () => void }): React.ReactNode;
declare function SignIn(props: { onSignedIn: () => void }): React.ReactNode;
// ---cut-end---
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });

export const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: makeClient,
  claims: { unexpected: (props) => <Crashed onRetry={props.reset} /> },
});

export const [OfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  errors: makeClient,
  parent: RootBoundary,
  claims: {
    NETWORK_ERROR: (props) => <button onClick={props.reset}>Retry</button>,
  },
});

export const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: makeClient,
  parent: OfflineBoundary,
  claims: {
    UNAUTHORIZED: (props) => {
      props.error;
      //    ^?
      return <SignIn onSignedIn={props.reset} />;
    },
  },
});
```

`parent` is the boundary it sits under. What a boundary owns adds up along its parents, so `useAuthBoundary()` narrows by what `Auth`, `Offline` and `Root` own. Mount them in that order, around the app or a page:

```tsx
<RootBoundary>
  <OfflineBoundary>
    <AuthBoundary>
      <App />
    </AuthBoundary>
  </OfflineBoundary>
</RootBoundary>
```

A boundary throws on its first render without its parent above it (`<AuthBoundary> needs <OfflineBoundary>, its parent, above it`), and its hook throws outside it.

## Narrow the queries and mutations under it

The hook returns `query`, `infiniteQuery` and `mutation`, which take tRPC's options for TanStack's own hooks: `useQuery`, `useSuspenseQuery`, `useQueries`, `usePrefetchQuery`, `useInfiniteQuery` and `useMutation`. The options they return type `error` without what the boundaries own. Here `PostTitle` reads the [handle](./handles.md) its route's loader ensured:

```tsx twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import {
  createErrorBoundary,
  createTrpcContext,
  type inferQueryHandle,
} from '@trpc12/tanstack-react-query';
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
} from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
const [, useTrpc] = createTrpcContext<typeof makeClient>();
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  errors: makeClient,
  claims: { unexpected: () => 'Something went wrong' },
});
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: makeClient,
  parent: RootBoundary,
  claims: { UNAUTHORIZED: () => 'Sign in' },
});
type PostHandle = inferQueryHandle<ReturnType<typeof useTrpc>['post']['byId']>;
// ---cut-end---
function PostTitle(props: { post: PostHandle }) {
  const trpc = useTrpc();
  const auth = useAuthBoundary();
  const post = useQuery(auth.query(trpc.$fromHandle(props.post)));
  if (post.error) {
    // Auth owns UNAUTHORIZED and Root every `defined: false` error, so
    // NOT_FOUND and BAD_REQUEST are left, and matchError() needs no `unexpected`
    return matchError(post.error, {
      NOT_FOUND: (err) => `No post ${err.data.id}`,
      BAD_REQUEST: () => 'Bad id',
    });
  }
  return <h1>{post.data?.title}</h1>;
}
```

A query's owned error throws to the nearest boundary that claims it, whose fallback replaces the subtree; `reset` refetches the failed queries and renders it again. The options' own `throwOnError` still throws what it says, too.

A mutation's owned error is held instead, so a form doesn't lose what the user typed when the session expires: the mutation stays pending, the subtree stays mounted behind the fallback (hidden in React's `<Activity>`, which keeps its state), and `reset` sends the mutation again, so `mutateAsync` resolves with its result. One `reset` sends every mutation the boundary holds. If the boundary unmounts first, they reject with their error.

## Claim by code or by tag

A code claims every error with it, whatever `defined` says: a returned `UNAUTHORIZED`, a thrown one, and a proxy's 401. A [tag](../../server/errors.md) claims one failure, so a boundary that asks a stale client to reload takes `ProcedureNotFound` (a call to a procedure the server doesn't have) and leaves the procedure's own `NOT_FOUND` to the component:

```tsx twoslash
// ---cut-start---
import { createErrorBoundary } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
// ---cut-end---
export const [StaleBoundary, useStaleBoundary] = createErrorBoundary({
  name: 'Stale',
  errors: makeClient,
  claims: {
    ProcedureNotFound: (props) => (
      <button onClick={() => location.reload()}>
        {props.error._tag}: reload to update
        {/*                ^? */}
      </button>
    ),
  },
});
```

Codes are `SCREAMING_CASE` and tags `PascalCase`, and a custom code is its own tag. When a boundary claims both a tag and its code, the tag's fallback takes that failure and the code's takes the rest.

## Everything else: `unexpected`

`unexpected` claims any throw no boundary under it owns: a crash on the server, a masked error, a bad response, a link's code nothing claims, and a crash while rendering too, so the root boundary is the app's "something went wrong". Its fallback's `error` is `unknown`; read a tRPC error with `isTrpcError()`. A framework's control flow passes it: an error with a `digest`, such as Next's `redirect()` and `notFound()`.

Under a boundary with `unexpected`, the queries and mutations are typed without every `defined: false` error, as `matchError()`'s `unexpected` handler takes them.

## Props

The component takes react-error-boundary's props:

- `resetKeys`: an array; a changed entry (by `Object.is`) resets the boundary, as its fallback's `reset` does. `resetKeys={[session.userId]}` clears a sign-in prompt when the user signs in in another tab.
- `onReset(details)`: after each reset, `details.reason` is `'reset'` (the fallback called it) or `'keys'` (with `prev` and `next`).
- `onError(error, info)`: for each error the boundary renders a fallback for, typed by its claims, with React's `info.componentStack`. Not for the errors it passes up.

```tsx twoslash
// ---cut-start---
import { createErrorBoundary } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc' })],
  });
const [AuthBoundary] = createErrorBoundary({
  name: 'Auth',
  errors: makeClient,
  claims: { UNAUTHORIZED: () => 'Sign in' },
});
declare function useSession(): { userId: string | undefined };
declare function report(error: unknown, stack: string | null | undefined): void;
declare function Page(): React.ReactNode;
// ---cut-end---
function Layout() {
  const session = useSession();
  return (
    <AuthBoundary
      resetKeys={[session.userId]}
      onError={(error, info) => report(error, info.componentStack)}
    >
      <Page />
    </AuthBoundary>
  );
}
```

## Details

- The outermost boundary makes one `QueryErrorResetBoundary` for the boundaries inside it, so a `reset` from any of them refetches.
- The innermost boundary that claims an error renders it, so a page can claim `NOT_FOUND` under an app-wide boundary that claims it too. A boundary passes up what it doesn't claim.
- `useSuspenseQuery` throws every error while it has no data, so its owned errors reach their boundary with or without `auth.query()`; with it, the `error` of a later refetch is narrowed.
- React runs no error boundaries on the server. A query that fails while streaming makes React render its Suspense boundary again in the browser, where the error boundary takes it.
- It needs React 19.2 or later, for `<Activity>`.
- Unstable: the feature stays, and its shape can change in a minor release ([Stability](../../packages.md#unstable)).
