# Error shells: failure ownership along the React tree

2026-10-18. Question ([proposal 24](../proposals/24-error-ownership.md), Q24.4–Q24.5): can a component above own some failures, so a component below is typed with only the ones left, the way [result-rpc](https://result-rpc.com/)'s shells do, on top of TanStack Query and tRPC's error union?

Code: `next/spikes/error-shells/` (it uses `closedLink` and `matchError` from [closed-error-unions](./closed-error-unions.md)); run with `pnpm test` from `next/`. `@tanstack/react-query` 5.104.1, React 19.3.

```ts
export const RootShell = createShell({ name: 'Root', claims: [], unexpected: true, fallback: Crashed });
export const OfflineShell = RootShell.extend({ name: 'Offline', claims: ['NETWORK_ERROR'], fallback: Offline });
export const AuthShell = OfflineShell.extend({ name: 'Auth', claims: ['UNAUTHORIZED'], fallback: SignIn });

function RenameDoc() {
  const trpc = useTrpc();
  const rename = AuthShell.useMutation(trpc.doc.rename.mutationOptions());
  // rename.error: TITLE_TAKEN | BAD_REQUEST. The procedure's union also has
  // UNAUTHORIZED (from middleware) and every boundary code; the shells own those.
  const message = rename.error && matchError(rename.error, {
    TITLE_TAKEN: () => 'That title is taken',
    BAD_REQUEST: () => 'Check the title', // no `unexpected`: Root owns it
  });
}

<RootShell.Boundary><OfflineShell.Boundary><AuthShell.Boundary>
  <RenameDoc />
</AuthShell.Boundary></OfflineShell.Boundary></RootShell.Boundary>
```

## What works

- **Built on TanStack Query as it is.** A shell's `useQuery`/`useMutation` passes TanStack's options through and adds a `throwOnError` predicate: "does this shell, or a shell it extends, own the error?". Owned errors are thrown into the tree. The rest stay on `error`, which is typed `Remaining<Closed<TError>, Codes, Unexpected>`.
- **Boundaries hand errors on.** Each `Boundary` is an error boundary that renders its fallback for errors it claims and re-throws the rest in render, so an error goes to the nearest shell that owns it. In the tests:
  - `NETWORK_ERROR` passes Auth and stops at Offline;
  - a thrown server error (masked `INTERNAL_SERVER_ERROR`) goes up to Root;
  - `TITLE_TAKEN` and a defined `NOT_FOUND` stay in the component.
- **Chains are explicit.** `extend()` builds the static parent chain the types come from. A hook checks at render that every shell in its chain is mounted above it, and otherwise throws `Auth.useQuery needs <Auth.Boundary> above it`, since the type would be wrong.
- **Claims go by code, whatever `defined` says.** Auth owns a returned `UNAUTHORIZED` and a proxy's 401 alike.
- **Types are checked** (`shells.test-d.ts`):
  - under Auth, rename's error is `TITLE_TAKEN | BAD_REQUEST`;
  - under Offline, `UNAUTHORIZED` is back;
  - with no `unexpected` claim, one boundary code comes off the closed union;
  - against today's open union, the same claim takes off nothing.
- `shells.ts` is about 190 lines (formatted). TanStack's types infer `TError` from tRPC's `queryOptions()`/`mutationOptions()` with no help.

## Findings

- **Reset needs one shared `QueryErrorResetBoundary`.** A query that threw stays errored on remount until its nearest reset boundary is reset. With one reset boundary per shell, retrying from Offline reset Offline's boundary while the hook used Auth's, and the query never refetched (the first test run failed this way). The outermost shell now makes the reset boundary and inner shells share it.
- **The fallback replaces the subtree.** That suits auth and offline screens, but not every claim. A shell that only reacts (a toast, a redirect) while the component keeps rendering would need the hook to swallow owned errors (`error: null` while `status` is `'error'`) instead of throwing them. Not built.
- **Suspense hooks don't fit as is.** `useSuspenseQuery` throws any error while there's no data, whoever owns it, so a component can't keep the errors it should handle. A suspense flavour would need the component's own boundary, or a hook that returns a result for unowned errors.
- **Mutations unmount the form.** An owned mutation error throws on the next render, so the form is replaced by the fallback and loses its local state. A "session expired" prompt that keeps the form needs the side-effect mode above.
- **Closing the union only matters for specific boundary codes.** Root's `unexpected: true` claim types correctly against today's union, because it subtracts `{ defined: false }`. Offline's `NETWORK_ERROR` claim does not.
- **It's React-only.** The predicate and `Remaining` are framework-free. Vue (`onErrorCaptured`), Solid (`ErrorBoundary`) and Svelte (`<svelte:boundary>`) each need their own boundary.

## Lean

- Ship the framework-free half in `@trpc12/tanstack-query`: the claim predicate (`owns(error)`), `Remaining`, and the options transform that sets `throwOnError`.
- Ship `createShell` in `@trpc12/tanstack-react-query`, in boundary mode only, and keep the side-effect mode open.
- It works without Q24.1, but `NETWORK_ERROR`-style claims only type correctly once the union is closed.
