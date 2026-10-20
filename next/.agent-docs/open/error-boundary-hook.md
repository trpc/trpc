---
title: What should `useAuthBoundary()` return, TanStack's hooks or options for them, or should the hooks be in the tuple?
summary: "Today `useAuthBoundary().useQuery(…)` wraps two of TanStack's hooks; options for TanStack's own `useQuery(…)` would cover all of them."
area: tanstack
recommended: B
links:
  - kind: code
    label: error-boundary.ts (internal)
    url: ../../packages/tanstack-react-query/src/error-boundary.ts
  - kind: decision
    label: error-boundaries
    url: ../decisions/error-boundaries.md
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
---

# What should `useAuthBoundary()` return, TanStack's hooks or options for them, or should the hooks be in the tuple?

## Why it matters

`unstable_createErrorBoundary()` returns `[AuthBoundary, useAuthBoundary]`, the way `createTrpcContext()` returns `[TrpcProvider, useTrpc]`, and the hook throws outside `<AuthBoundary>`. What the hook returns is what every component under a boundary writes. Today it's `{ useQuery, useMutation, owns }`, TanStack's two hooks wrapped, so `useInfiniteQuery`, `useQueries`, `usePrefetchQuery` and TanStack's `initialData` overloads aren't there. result-rpc's shells have `shell.useQuery` and `shell.useMutation`; react-error-boundary's `useErrorBoundary()` returns `{ showBoundary, resetBoundary }`, with no data hooks.

## Options

### A) Keep it: the hook returns wrapped hooks

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createErrorBoundaryA as createErrorBoundary } from '../open/error-boundary-hook.ts';
import { z } from 'zod';
import { authed } from './server.ts';
const router = {
  doc: {
    byId: authed
      .errors({ NOT_FOUND: { message: 'No such doc' } })
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
declare function SignIn(props: { reset: () => void }): null;
// ---cut-end---
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  parent: RootBoundary,
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});

function DocTitle(props: { id: string }) {
  const trpc = useTrpc();
  const { useQuery } = useAuthBoundary();
  const doc = useQuery(trpc.doc.byId.queryOptions({ input: { id: props.id } }));
  doc.error?.code;
  //         ^?
  return null;
}
```

- ✅ Built and tested
- ✅ One call per query, as with TanStack
- ❌ Only `useQuery` and `useMutation`; each other TanStack hook needs its own wrapper, and the wrappers drop TanStack's overloads (`initialData` making `data` defined)
- ❌ A hook that returns hooks is unusual, and the rules-of-hooks lint only sees them when they're destructured: it skips `useAuthBoundary().useQuery(…)`

### B) The hook returns options for TanStack's own hooks

`auth.query(options)` sets `throwOnError` and types the options' error without what the boundaries own; TanStack's hook reads both.

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createErrorBoundaryB as createErrorBoundary } from '../open/error-boundary-hook.ts';
import { z } from 'zod';
import { authed } from './server.ts';
const router = {
  doc: {
    byId: authed
      .errors({ NOT_FOUND: { message: 'No such doc' } })
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id, title: 'Hello' })),
    rename: authed
      .errors({ TITLE_TAKEN: { message: 'That title is taken' } })
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => ({ id: opts.input.id, title: opts.input.title })),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
const [RootBoundary] = createErrorBoundary({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: () => null,
});
declare function SignIn(props: { reset: () => void }): null;
// ---cut-end---
import { useMutation, useQuery } from '@tanstack/react-query';

const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  parent: RootBoundary,
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});

function DocTitle(props: { id: string }) {
  const trpc = useTrpc();
  const auth = useAuthBoundary();
  const doc = useQuery(
    auth.query(trpc.doc.byId.queryOptions({ input: { id: props.id } })),
  );
  doc.error?.code;
  //         ^?
  const rename = useMutation(auth.mutation(trpc.doc.rename.mutationOptions()));
  rename.error?.code;
  //            ^?
  return null;
}
```

- ✅ Every TanStack hook works, with its overloads: `useSuspenseQuery`, `useInfiniteQuery` (with `auth.infiniteQuery`), `useQueries`, `usePrefetchQuery`
- ✅ The same pattern as `trpc.doc.byId.queryOptions()`, which already feeds TanStack's hooks rather than wrapping them, and the rules-of-hooks lint sees TanStack's hooks
- ❌ One more wrapper at each call site, and a method per kind of options (`query`, `infiniteQuery`, `mutation`)
- ❌ Not built: the built hooks become these three methods

### C) A three-element tuple with the hooks in it

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createErrorBoundaryC as createErrorBoundary } from '../open/error-boundary-hook.ts';
import { z } from 'zod';
import { authed } from './server.ts';
const router = {
  doc: {
    byId: authed
      .errors({ NOT_FOUND: { message: 'No such doc' } })
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
declare function SignIn(props: { reset: () => void }): null;
// ---cut-end---
const [AuthBoundary, useAuthQuery, useAuthMutation] = createErrorBoundary({
  name: 'Auth',
  parent: RootBoundary,
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});

function DocTitle(props: { id: string }) {
  const trpc = useTrpc();
  const doc = useAuthQuery(
    trpc.doc.byId.queryOptions({ input: { id: props.id } }),
  );
  doc.error?.code;
  //         ^?
  return null;
}
```

- ✅ Reads like TanStack's hooks, and like result-rpc's `shell.useQuery`
- ❌ Three names to invent per boundary, and the tuple grows with each hook it covers, or never covers `useInfiniteQuery` and `useQueries`
- ❌ The same wrapped hooks as A, with the same lost overloads

## Recommendation

**B.** `@trpc12/tanstack-react-query` already works by handing options to TanStack's hooks rather than wrapping them, and B keeps that: every hook and overload works now and as TanStack adds them, and the tuple stays two elements like `createTrpcContext()`'s. The wrapper costs one call per hook, which is what `trpc.x.queryOptions()` already asks for.

## Blocked until answered

- The public export and its docs page: the hook's shape is what both show first.

## Details

- B transforms options, so it works with every answer to [error-boundary-owned-errors](./error-boundary-owned-errors.md): holding a mutation wraps its `mutationFn`. Only hiding an owned error from the hook's result (an `error` of `null` while `status` is `'error'`, set aside in the error-boundaries record) needs wrapped hooks.
- B's options keep the key's `DataTag`, so `queryClient.getQueryData(queryKey)` types its error without the owned codes too. That's a little narrower than the cache holds; nothing reads the error from it today.
- The methods' names follow tRPC's own (`queryOptions`, `infiniteQueryOptions`, `mutationOptions`) without the `Options` suffix, since `auth.query(trpc.doc.byId.queryOptions(…))` already says "options" once.
