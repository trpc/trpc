---
title: When a boundary owns a mutation's error, should its fallback replace the form, or should the form stay mounted while the boundary handles it?
summary: An owned error unmounts everything under its boundary, so a sign-in prompt after a failed save loses what the user typed.
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

# When a boundary owns a mutation's error, should its fallback replace the form, or should the form stay mounted while the boundary handles it?

## Why it matters

A boundary's hooks throw the errors it owns, and its `fallback` replaces everything under it, as with any React error boundary. For a query that loses nothing: it has no data to show. For a mutation it loses the form: a session that expires while the user edits a title shows `<SignIn>` in its place, and after signing in the form comes back empty. This is the case that made the first version's mutation example confusing. result-rpc's default (`effect: "pause"`) holds owned work instead and keeps the tree mounted; its `"escalate"` throws as we do. react-error-boundary and TanStack Router's `CatchBoundary` only replace.

## Options

### A) Keep it: an owned error replaces the subtree

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { useState } from 'react';
import { createErrorBoundaryA as createErrorBoundary } from '../open/error-boundary-owned-errors.ts';
import { z } from 'zod';
import { authed } from './server.ts';
const router = {
  doc: {
    rename: authed
      .errors({ TITLE_TAKEN: { message: 'That title is taken' } })
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => ({ id: opts.input.id, title: opts.input.title })),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
declare function SignIn(props: { reset: () => void }): null;
// ---cut-end---
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});

function RenameDoc(props: { id: string }) {
  const trpc = useTrpc();
  const [title, setTitle] = useState('');
  const { useMutation } = useAuthBoundary();
  const rename = useMutation(trpc.doc.rename.mutationOptions());
  // UNAUTHORIZED: <SignIn> replaces this form and `title` is gone.
  // Its reset() renders an empty form; the user types the title again.
  return (
    <input value={title} onChange={(event) => setTitle(event.target.value)} />
  );
}
```

- ✅ Built and tested; behaves like every React error boundary, including for a mutation's `mutateAsync` caller, which gets the error
- ❌ An owned mutation error unmounts the form and its state, and the user's change is lost

### B) Queries replace, mutations hold

An owned mutation error doesn't throw. The mutation stays `pending`, and the boundary shows its fallback with its children hidden in React's `<Activity mode="hidden">`, which keeps their state. `reset()` runs the held mutation again with the same variables and shows the children; `mutateAsync` resolves with the result. Queries throw as in A.

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { useState } from 'react';
import { createErrorBoundaryB as createErrorBoundary } from '../open/error-boundary-owned-errors.ts';
import { z } from 'zod';
import { authed } from './server.ts';
const router = {
  doc: {
    rename: authed
      .errors({ TITLE_TAKEN: { message: 'That title is taken' } })
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation((opts) => ({ id: opts.input.id, title: opts.input.title })),
  },
};
const [, useTrpc] = createTrpcContext<typeof router>();
declare function SignIn(props: { reset: () => void }): null;
// ---cut-end---
const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: SignIn, // signing in calls reset()
});

function RenameDoc(props: { id: string }) {
  const trpc = useTrpc();
  const [title, setTitle] = useState('');
  const { useMutation } = useAuthBoundary();
  const rename = useMutation(trpc.doc.rename.mutationOptions());
  // UNAUTHORIZED: <SignIn> shows, this form is hidden with `title` kept,
  // and `rename` stays pending. reset() sends the rename again.
  return (
    <input value={title} onChange={(event) => setTitle(event.target.value)} />
  );
}
```

- ✅ The form survives, and the user's change goes through after signing in without retyping it
- ✅ The types stay true: an owned error never reaches the mutation's `error`, since it never settles with one
- ❌ Not built. It needs `<Activity>`, so React 19.2 or later (the peer range is `^19` today)
- ❌ Two behaviours to learn, and a held mutation stays pending until `reset()`: the fallback needs a way to give up, settled when it's built

### C) Queries and mutations both hold

As B, and a query's owned error holds too: it keeps its last data, or stays pending, while the boundary shows its fallback with the children hidden. This is result-rpc's default.

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createErrorBoundaryC as createErrorBoundary } from '../open/error-boundary-owned-errors.ts';
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
declare function Offline(props: { reset: () => void }): null;
// ---cut-end---
const [OfflineBoundary, useOfflineBoundary] = createErrorBoundary({
  name: 'Offline',
  claims: ['NETWORK_ERROR'],
  fallback: Offline,
});

function DocTitle(props: { id: string }) {
  const trpc = useTrpc();
  const { useQuery } = useOfflineBoundary();
  const doc = useQuery(trpc.doc.byId.queryOptions({ input: { id: props.id } }));
  // A refetch that fails offline keeps `doc.data` and the tree under
  // <OfflineBoundary> mounted, hidden behind <Offline> until reset().
  return <h1>{doc.data?.title}</h1>;
}
```

- ✅ One behaviour for both, and nothing under a boundary ever unmounts for an owned error
- ❌ Hiding the page behind the fallback while it keeps stale data is surprising when the fallback is a full page, and a query that never resolves is harder to debug than one that fails
- ❌ Not built, and the most to build: every held query's `queryFn` waits for `reset()`

## Recommendation

**B.** A failed query has nothing to show, so replacing it is what users expect from an error boundary; a failed save has the user's work in it, and holding it is the only option that keeps both the form and the types honest. It fixes the case the first version got wrong without changing what queries do.

## Blocked until answered

- The public export and its docs page: the docs' mutation example says what happens to the form.

## Details

- Under B the hold wraps the options' `mutationFn`: an owned failure waits for the boundary's `reset()`, then calls the procedure again. `throwOnError` stays false for mutations, so it works with either answer to [error-boundary-hook](./error-boundary-hook.md).
- `<Activity mode="hidden">` keeps state and unmounts effects, so the hidden form's subscriptions stop and start again when it's shown; the mutation itself lives in TanStack's `MutationCache` and keeps waiting.
- Giving up on a held mutation (closing the sign-in prompt) could reject it with `CLIENT_CLOSED_REQUEST`, which `matchError()`'s `unexpected` handles, or leave the decision to the fallback through a second callback next to `reset`.
- A fourth answer, not shown: mutations through a boundary's hook don't throw at all and keep their full error type, so only queries are narrowed. It's the least to build and gives up the point of typing mutations.
