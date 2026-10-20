---
title: Should tRPC ship error shells, type-safe error boundaries that own some failures so the components below are typed without them?
summary: A shell owns `UNAUTHORIZED` or offline for the tree under its boundary, so a `useQuery` below types `error` with only what's left to handle.
area: tanstack
recommended: E
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
  - kind: decision
    label: stability-jsdoc-tags
    url: ../decisions/stability-jsdoc-tags.md
  - kind: docs
    label: TanStack Query errors
    url: https://v12.trpc.io/v12/docs/integrations/tanstack-query#errors
  - kind: docs
    label: result-rpc
    url: https://result-rpc.com/
---

# Should tRPC ship error shells, type-safe error boundaries that own some failures so the components below are typed without them?

## Why it matters

Error shells are type-safe error boundaries, after [result-rpc](https://result-rpc.com/)'s shells. A shell claims some error codes for the tree under its `Boundary`. Its hooks throw those errors to the boundary, which renders a fallback, and type `error` without them, so a component lists only the failures it can do something about. The examples here are B's API; C and E change what's around it.

**1. Shells own failures for the tree under them.**

```tsx twoslash
// ---cut-start---
import type { ReactNode } from 'react';
import { createShellB as createShell } from '../open/error-shells.ts';
declare function DocTitle(props: { id: string }): ReactNode;
// ---cut-end---
const RootShell = createShell({
  name: 'Root',
  claims: [],
  unexpected: true, // crashes, masked server errors, bad responses
  fallback: (props) => (
    <p>
      Something went wrong. <button onClick={props.reset}>Try again</button>
    </p>
  ),
});
const OfflineShell = RootShell.extend({
  name: 'Offline',
  claims: ['NETWORK_ERROR'],
  fallback: (props) => (
    <p>
      You're offline. <button onClick={props.reset}>Retry</button>
    </p>
  ),
});
const AuthShell = OfflineShell.extend({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: () => <a href="/sign-in">Sign in to read this doc</a>,
});

export function DocPage(props: { id: string }) {
  return (
    <RootShell.Boundary>
      <OfflineShell.Boundary>
        <AuthShell.Boundary>
          <DocTitle id={props.id} />
        </AuthShell.Boundary>
      </OfflineShell.Boundary>
    </RootShell.Boundary>
  );
}
```

An owned error goes to the nearest boundary that claims it, and its fallback replaces that boundary's subtree: signed out, the page shows the sign-in link instead of the title. A `NETWORK_ERROR` passes `Auth` and stops at `Offline`; a crash goes up to `Root`. `reset` clears the boundary and resets the one `QueryErrorResetBoundary` the chain shares, so the subtree mounts again and its failed queries refetch: back online, Retry shows the title.

**2. A component under them handles only what's left.**

```tsx twoslash
// @errors: 2345
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { matchError } from '@trpc12/trpc/client';
import { createShellB as createShell } from '../open/error-shells.ts';
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
const RootShell = createShell({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: () => null,
});
const OfflineShell = RootShell.extend({
  name: 'Offline',
  claims: ['NETWORK_ERROR'],
  fallback: () => null,
});
const AuthShell = OfflineShell.extend({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: () => null,
});
// ---cut-end---
function DocTitle(props: { id: string }) {
  const trpc = useTrpc();
  const doc = AuthShell.useQuery(
    trpc.doc.byId.queryOptions({ input: { id: props.id } }),
  );
  if (doc.error) {
    doc.error;
    //  ^?
    doc.error.code;
    //        ^?
    // Doesn't compile: NOT_FOUND is still this component's to handle
    matchError(doc.error, { BAD_REQUEST: () => 'Bad link' });
    // No UNAUTHORIZED, NETWORK_ERROR or `unexpected`: the shells own them
    const message = matchError(doc.error, {
      NOT_FOUND: () => 'No such doc',
      BAD_REQUEST: () => 'Bad link',
    });
    return <h1>{message}</h1>;
  }
  return <h1>{doc.data?.title ?? 'Loading…'}</h1>;
}
```

Today (A), `queryOptions()` and `mutationOptions()` carry each procedure's full error union, so every component's `error` also lists the sign-in, offline and crash errors it can do nothing about, and its `matchError()` needs their keys or `unexpected`. App-wide handling (an error boundary, `QueryCache`'s `onError`) gets React's untyped error and never narrows what a component sees. The spike (`spikes/error-shells/`, about 190 lines on TanStack Query's `throwOnError`, with DOM and type tests) shows shells need no TanStack changes; the closed union and `matchError()` they build on have shipped.

## Options

### A) Keep it as it is: no shells

Each component handles the whole union; app-wide failures go through `unexpected` or an untyped boundary.

```ts twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { matchError } from '@trpc12/trpc/client';
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
const trpc = useTrpc();
declare const id: string;
// ---cut-end---
const doc = useQuery(trpc.doc.byId.queryOptions({ input: { id } }));
const message =
  doc.error &&
  matchError(doc.error, {
    NOT_FOUND: () => 'No such doc',
    BAD_REQUEST: () => 'Bad link',
    UNAUTHORIZED: () => 'Sign in to read this doc',
    NETWORK_ERROR: () => "You're offline",
    BAD_RESPONSE: () => 'Try again later',
    unexpected: (e) => e.message,
  });
```

- ✅ Nothing new to build, document or keep in step with TanStack
- ❌ Every component repeats the sign-in, offline and crash handling, or folds it into `unexpected`
- ❌ An app-wide error boundary gets `unknown` and narrows with `isTrpcError` by hand

### B) Shells in boundary mode

The examples at the top. A shell owns codes (and optionally every `defined: false` error). Its hooks throw owned errors to the nearest owning `Boundary`, which renders a fallback and re-throws what it doesn't own; `error` is typed without them. A hook checks at render that its whole chain is mounted.

Queries suit it: while a query has failed there's no data to show, so a fallback in its place loses nothing. Mutations are the awkward case. An owned mutation error is thrown on the next render too, so the fallback replaces the whole subtree, form included, and what the user typed is gone:

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { matchError } from '@trpc12/trpc/client';
import { useState } from 'react';
import { createShellB as createShell } from '../open/error-shells.ts';
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
const RootShell = createShell({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: () => null,
});
const OfflineShell = RootShell.extend({
  name: 'Offline',
  claims: ['NETWORK_ERROR'],
  fallback: () => null,
});
const AuthShell = OfflineShell.extend({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: () => null,
});
// ---cut-end---
function RenameDoc(props: { id: string }) {
  const trpc = useTrpc();
  const [title, setTitle] = useState('');
  const rename = AuthShell.useMutation(trpc.doc.rename.mutationOptions());
  rename.error?.code;
  //            ^?
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // If the session expired, UNAUTHORIZED goes to Auth: its sign-in
        // fallback replaces this form, and `title` is lost
        rename.mutate({ id: props.id, title });
      }}
    >
      <input value={title} onChange={(event) => setTitle(event.target.value)} />
      {rename.error && (
        <p>
          {matchError(rename.error, {
            TITLE_TAKEN: () => 'That title is taken',
            BAD_REQUEST: () => 'Check the title',
          })}
        </p>
      )}
    </form>
  );
}
```

- ✅ Built and tested in the spike, including the shared `QueryErrorResetBoundary` that retry needs
- ✅ Claims go by code: a returned `UNAUTHORIZED`, a thrown one and a proxy's 401 all go to `Auth`
- ❌ The fallback replaces the subtree, so an owned mutation error unmounts the form and its local state
- ❌ Suspense hooks don't fit: `useSuspenseQuery` throws every error while it has no data

### C) Boundary mode plus a side-effect mode

As B, and a shell can claim codes without a fallback. Its hooks keep the errors it owns out of `error` instead of throwing them, so nothing unmounts, and call its `onError`: open a sign-in modal, show a toast, redirect. `retry` runs the failed mutation again with the same variables, so after signing in the user's rename goes through without retyping it. Boundary shells (B) still own offline and crashes.

```ts twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { createShellC as createShell } from '../open/error-shells.ts';
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
declare function openSignInModal(opts: { onSignedIn: () => void }): void;
const RootShell = createShell({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: () => null,
});
const trpc = useTrpc();
// ---cut-end---
const SessionShell = RootShell.extend({
  name: 'Session',
  claims: ['UNAUTHORIZED'],
  mode: 'react', // don't throw, don't render a fallback
  onError: (error, helpers) => openSignInModal({ onSignedIn: helpers.retry }),
});

const rename = SessionShell.useMutation(trpc.doc.rename.mutationOptions());
rename.status; // 'error' while the modal is open
rename.error; // null for UNAUTHORIZED; the form stays mounted with its title
```

- ✅ Covers "session expired" without losing what the user typed
- ❌ Not spiked
- ❌ `status: 'error'` with `error: null` is new for TanStack users, and `isError` checks would misread it

### D) Primitives only

Ship the claim predicate, the `Remaining` type and the options transform that sets `throwOnError`; apps write their own boundaries. Names are illustrative.

```ts twoslash
// ---cut-start---
import { useQuery } from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import { claimsD as claims } from '../open/error-shells.ts';
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
const trpc = useTrpc();
declare const id: string;
// ---cut-end---
const auth = claims({ claims: ['UNAUTHORIZED'] });
const doc = useQuery(
  auth.options(trpc.doc.byId.queryOptions({ input: { id } })),
); // sets throwOnError
doc.error; // without UNAUTHORIZED
// your error boundary: if (!auth.owns(error)) throw error;
```

- ✅ Small, framework-free, no component API to support
- ❌ Every app rewrites the boundary, the mounted-chain check and the shared reset boundary; the spike's first run got the reset wrong

### E) Ship B now as `experimental_createShell`

B's API and behavior, exported as `experimental_createShell` from `@trpc12/tanstack-react-query`, its docs page hidden in an experiment. Picking B settles the shape, so `createShell` ships without a prefix; E doesn't: an experimental export might change or go away in any release ([stability-jsdoc-tags](../decisions/stability-jsdoc-tags.md)), so apps can use shells while C and Suspense stay open, and what they run into answers them. It takes:

- The spike's `shells.ts` (about 190 lines) moved into `packages/tanstack-react-query/src/`, on the shipped closed union, with its DOM and type tests; the spike is deleted.
- `experimental_createShell` exported; `Shell`, `ShellSpec` and `Remaining` keep their names, tagged `@stability experimental`, as `trpc/jsdoc` requires.
- A docs page in a new experiment in `www/src/experiments.ts`, so it's hidden from the sidebar and search engines and no listed page links it.
- Later: promoting it is B, `createShell` with `experimental_createShell` as a `@deprecated` alias and a `PROMOTED` entry for the codemod. Dropping it removes one export.

```tsx twoslash
// ---cut-start---
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import type { ReactNode } from 'react';
import { experimental_createShellE as experimental_createShell } from '../open/error-shells.ts';
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
const trpc = useTrpc();
declare const id: string;
type Fallback = (props: { error: unknown; reset: () => void }) => ReactNode;
declare const Crashed: Fallback, SignIn: Fallback;
// ---cut-end---
// import { experimental_createShell } from '@trpc12/tanstack-react-query';
const RootShell = experimental_createShell({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: Crashed,
});
// Only the export carries the prefix; a shell's own methods keep their names
const AuthShell = RootShell.extend({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});
const doc = AuthShell.useQuery(trpc.doc.byId.queryOptions({ input: { id } }));
```

- ✅ Apps get type-safe error boundaries now, and their queries and forms show whether C or a Suspense flavour is needed before the shape is settled
- ✅ Additive and cheap to drop: one export, one hidden page, nothing in TanStack
- ❌ Apps that adopt it rename the import once it's promoted (the codemod does it)
- ❌ Ships B's limits as they are: a mutation's fallback still unmounts the form

## Recommendation

**E.** B's shape is built and tested and needs nothing from TanStack, but whether forms need C and Suspense needs its own flavour is best answered by apps using it, which an `experimental_` export allows without committing to the shape. React only, all in `@trpc12/tanstack-react-query` for now (Q24.5 B); when it's promoted to B, the framework-free part can move to `@trpc12/tanstack-query` (Q24.5 A, see Details) with its types re-exported, so nothing breaks.

## Blocked until answered

- Nothing else is blocked: shells are additive, and `useQuery(trpc.x.queryOptions())` keeps working as it does. Porting the spike into the packages, with docs, waits on this.

## Details

**Where shells live (Q24.5), if they ship.** The claim predicate (`owns(error)`), `Remaining` and the `throwOnError` transform contain no React; each framework's boundary differs (Vue's `onErrorCaptured`, Solid's `<ErrorBoundary>`, Svelte's `<svelte:boundary>`). With D, this only picks the primitives' package. With E, it can wait for promotion.

- **A (recommended for B): the framework-free part in `@trpc12/tanstack-query`, `createShell` per adapter.** React first; `@trpc12/experimental-tanstack-vue-query` and the others when someone asks. Written and tested once, and other frameworks can use the primitives before their adapter has `createShell`. Two packages to keep in step for one feature.
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
- A fallback's `error` is `unknown`. Typing it with the codes its shell claims (`Offline`'s fallback gets a `NETWORK_ERROR`) would fit "type-safe" better; not built.
