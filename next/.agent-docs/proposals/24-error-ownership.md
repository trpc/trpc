# 24 — Error ownership: closed unions, exhaustive matching and shells

| Status     | Area                          | Depends on     | oRPC parity rows           |
| ---------- | ----------------------------- | -------------- | -------------------------- |
| `proposed` | client, links, tanstack-query | 07, 16, 17, 19 | End-to-end typesafe errors |

## Summary

[result-rpc](https://result-rpc.com/) ("Errors are values. Values have owners.") gives every call one **closed** failure union, which includes transport, protocol and stale-client failures. React **shells** above a component claim some of those failures, and the component is typed with only the rest, so a missing case fails to compile. We already infer, declare, mask and tag errors ([07](./07-errors.md), [errors](../decisions/errors.md), [inferred-errors](../decisions/inferred-errors.md)). What we lack is a closed client union, a matcher, and ownership along the component tree.

**Recommendation:**

- Close the union. The server masks thrown, undeclared custom codes, and the client types `defined: false` errors as one member per built-in code.
- Ship `matchError()` in `@trpc12/trpc/client`.
- Ship error shells in boundary mode: the claim primitive in `@trpc12/tanstack-query` and `createShell` in `@trpc12/tanstack-react-query`.

Two spikes back this: [closed-error-unions](../notes/closed-error-unions.md) and [error-shells](../notes/error-shells.md).

## Today

- **The client's union is open.** `ClientError<E>` is `DefinedError<E> | UnexpectedError`, and `UnexpectedError` is `TrpcError<BuiltinErrorCode | (string & {}), unknown> & { defined: false }` (`packages/trpc/src/client/types.ts`).
  - Built-in links declare no errors, so their failures (`NETWORK_ERROR`, `CLIENT_CLOSED_REQUEST`, `STREAM_INTERRUPTED`, `CLIENT_ERROR`, `PARSE_ERROR`) land in the open part, as `www/docs/client/custom-links.md` says.
  - `LinkDecl.errors` exists, but it adds `defined: true` errors.
- **One thing keeps it open.** A thrown, undeclared `TrpcError` keeps its code on the wire (`normalizeCause`, `server/execution/execute.ts`). Only non-`TrpcError` throws are masked ([mask-unexpected-errors](../decisions/mask-unexpected-errors.md)).
  - The census in [closed-error-unions](../notes/closed-error-unions.md#census-what-reaches-the-client-over-httplink) shows that every other failure arrives as a built-in code.
  - `codeOfStatus` maps a proxy's 401, 502 and so on onto built-in codes.
- **Narrowing** is `err.defined` then `code`, or `Effect.catchTag` on each failure's own `_tag` ([error-tags](../decisions/error-tags.md)). Nothing checks that every case is handled.
- **TanStack adapters** type `error` with the full union in every component ([tanstack-query-types](../decisions/tanstack-query-types.md)). App-wide handling (`QueryCache` `onError`, error boundaries) is untyped and never narrows what a component sees.
- **Boundary codes are coarse.**
  - `PARSE_ERROR` covers a foreign response with an unmapped status, an undecodable body, `validationLink`'s output mismatch, and the server failing to parse a request.
  - A client calling a procedure the server lacks (a stale deploy) gets `NOT_FOUND` with `defined: false`. (It is now tagged `ProcedureNotFound`, on the wire too: [error-tags](../decisions/error-tags.md).)
  - There is no client-side timeout or offline code. (A call whose `signal` times out now fails with `TIMEOUT`: [client-timeout-error](../decisions/client-timeout-error.md).)
- **Error data isn't checked on the client.** `validationLink` validates outputs only. `fromWireError` rebuilds every error as a plain `TrpcError`, so `instanceof PostNotFound` is false on the client.

## Goals

- A component's `error` type lists exactly what it must handle, and a missing case is a compile error.
- App-wide failures (signed out, offline, crashed) are handled once, by a component that owns them, with types to match.
- The types match what arrives at runtime.
- Nothing changes for apps that don't use shells. `safe()`, `isDefinedError` and `catchTag` keep working.

## Non-goals

- A `Result<T, E>` type with combinators for Promise users. The Effect client already gives Effect's, and `safe()` stays a tuple ([errors](../decisions/errors.md), Q7.3).
- result-rpc's entity cache, `.affects()` and `touch()`. That is declared invalidation, which is later ([declared-invalidation-later](../decisions/declared-invalidation-later.md)).
- Changing what `defined` means: it still says "in the procedure's contract".

## Options

### Q24.1: close the client's union

```ts
// A, B: what a call's error becomes
type ClientError<E> = DefinedError<E> | BoundaryError;
type BoundaryError = {
  [C in BuiltinErrorCode]: TrpcError<C, unknown> & { readonly defined: false };
}[BuiltinErrorCode];
```

- **A: server masks, client types closed.**
  - Thrown, undeclared `TrpcError`s with a custom code become `INTERNAL_SERVER_ERROR` on the wire, like other unexpected throws, with the original sent to `onError`. Built-in codes and declared constructors are unchanged.
  - `UnexpectedError` becomes `BoundaryError`.
  - ✅ No extra link, and internal codes stop leaking.
  - ❌ `throw error({ code: 'OUT_OF_STOCK' })` from a helper stops reaching the client as `OUT_OF_STOCK` unless it's declared. Today that works, untyped.
- **B: client folds, opt-in.**
  - A `closedLink()` maps off-list `defined: false` codes to `INTERNAL_SERVER_ERROR` (the spike's link), and a client built with it types the closed union.
  - ✅ No server change.
  - ❌ Two typings of the same call, and the server still leaks custom codes to other clients.
- **C: keep it open.**
  - ✅ Nothing changes.
  - ❌ Shells can own `UNAUTHORIZED` only when it's returned, never one from a proxy, and can't own `NETWORK_ERROR` at all.

### Q24.2: what the closed set is

- **A: every built-in code, `defined: false`** (24 members).
  - ✅ It's honest: proxies and thrown built-in codes can produce any of them. Retries and statuses keep working by code.
  - ❌ Too many to list by hand, so a matcher needs a catch-all.
- **B: a few categories** (`NETWORK_ERROR`, `CLIENT_CLOSED_REQUEST`, `STREAM_INTERRUPTED`, `PROTOCOL_ERROR`, `SERVER_ERROR`, `INTERNAL_SERVER_ERROR`), with other undefined codes folded in.
  - ✅ Short, like result-rpc's list.
  - ❌ Throws information away (a proxy's 401 becomes `PROTOCOL_ERROR`), and `retryLink`'s by-code rules change.

### Q24.3: exhaustive matching

```ts
matchError(err, {
  TITLE_TAKEN: (e) => …, // one per defined code, all required
  BAD_REQUEST: (e) => …,
  unexpected: (e) => …, // required while anything `defined: false` is left
});
```

- **A: `matchError(err, handlers)`** in `@trpc12/trpc/client`. Its result is inferred from the handlers.
- **B: A, plus `.match(handlers)` on `safe()` results.** `[data, error]` stays as it is.
- **C: none.** Use `switch (err.code)` with `satisfies never`.

The spike found that A works on today's open union too: `unexpected` takes the whole `defined: false` part. So Q24.3 doesn't depend on Q24.1.

### Q24.4: shells

```ts
const RootShell = createShell({
  name: 'Root',
  claims: [],
  unexpected: true,
  fallback: Crashed,
});
const AuthShell = RootShell.extend({
  name: 'Auth',
  claims: ['UNAUTHORIZED'],
  fallback: SignIn,
});

const rename = AuthShell.useMutation(trpc.doc.rename.mutationOptions());
rename.error; // TITLE_TAKEN | BAD_REQUEST: Auth owns UNAUTHORIZED, Root owns every undefined error
```

- **A: boundary mode.**
  - A shell's hooks set `throwOnError` to "a shell in my chain owns it". Each `Boundary` renders its fallback for its own claims and re-throws the rest. Hooks check that their chain is mounted.
  - ✅ Built and tested ([error-shells](../notes/error-shells.md)); TanStack needs no changes.
  - ❌ The fallback replaces the subtree, so an owned mutation error unmounts the form.
- **B: A, plus a side-effect mode.**
  - A shell can instead react (a toast, a redirect, a sign-in modal) while its hooks swallow owned errors, leaving `error: null` and `status: 'error'`.
  - ✅ Covers "session expired" without losing form state.
  - ❌ Not spiked. A hook whose `status` is `'error'` while its `error` is `null` is new for TanStack users.
- **C: primitives only.** Ship `owns()`, the `Remaining` type and the options transform, and let apps write their boundaries.
- **D: not now.**

### Q24.5: where shells live

- **A: the framework-free half in `@trpc12/tanstack-query`** (claims, `Remaining`, the `throwOnError` transform), with `createShell` per adapter. React comes first; Vue, Solid and Svelte follow on request.
- **B: React only**, all in `@trpc12/tanstack-react-query`.

Suspense hooks don't fit either way: `useSuspenseQuery` throws every error while there's no data. The spike doesn't cover them.

### Q24.6: sharper boundary codes

- **A: split `PARSE_ERROR`.** A foreign or undecodable response becomes `BAD_RESPONSE` (status 0, client-side). `PARSE_ERROR` keeps "the request couldn't be parsed", and `validationLink`'s output mismatch becomes `BAD_RESPONSE` too.
- **B: also add `TIMEOUT` on the client**, for a call option `timeout` that aborts with it, which is distinct from `CLIENT_CLOSED_REQUEST`.
- **C: leave the codes as they are.**

A shipped as `BAD_RESPONSE` ([closed-client-errors](../decisions/closed-client-errors.md)). B was answered without the `timeout` option: a `signal` that aborts with a `TimeoutError` fails the call with `TIMEOUT` ([client-timeout-error](../decisions/client-timeout-error.md)).

### Q24.7: stale clients

- **A: a router fingerprint.** The client sends a hash of the router's procedure paths and types (`trpc-router`); a server whose hash differs answers unknown paths with a client-side `STALE_CLIENT`.
- **B: a distinct code for unknown paths.** The server answers a path it doesn't have with `NOT_FOUND` and `data: { procedure: path }`, and the client reads that as `STALE_CLIENT`.
- **C: later.**

Human, 2026-10-20: C, later. A procedure the server lacks stays a built-in `NOT_FOUND`; B is the cheaper path when it comes back ([stale-client-error](../decisions/stale-client-error.md)). Since then every distinct failure has its own `_tag`, and this one reaches clients as `ProcedureNotFound`, still a `NOT_FOUND`, with no fingerprint ([error-tags](../decisions/error-tags.md)).

### Q24.8: errors decoded on the client

- **A: `validationLink` checks defined errors' `data`** against the contract's error specs and rebuilds `TrpcError.Tagged` instances, so `instanceof PostNotFound` holds and rich `data` types come back.
- **B: no.** The server already validates `data` before sending it.

## Recommendation

- **Q24.1 A, Q24.2 A.** Mask undeclared custom codes on the server and type the client's union closed over built-in codes. Undeclared custom codes reaching the client are the only thing keeping the union open, and they leak internals just like messages do. Declared constructors already cover "throw a typed error from a helper".
- **Q24.3 A.** It's small, it works even without Q24.1, and it gives result-rpc's "a missing case fails to compile".
- **Q24.4 A, Q24.5 A.** Boundary mode is built and tested. Keep side-effect mode (B) open until a real "session expired" form needs it.
- **Q24.6 A.** `PARSE_ERROR` meaning four things is the one coarse code shells will trip on.
- **Q24.7 C** and **Q24.8 B** for now. Both are independent of the rest and haven't been spiked. The human chose Q24.7 C ([stale-client-error](../decisions/stale-client-error.md)).

What we give up: thrown custom codes that reach the client untyped (Q24.1 A), and keeping the form mounted when a shell owns a mutation's error (Q24.4 A).

> ⚠️ **Parity:** none of the options blocks a row in [`orpc-parity.md`](../reference/orpc-parity.md). oRPC's `ORPCError` is open as well; a closed union goes beyond oRPC's "End-to-end typesafe errors".

## Questions

- **Q24.1** Close the client's error union: A the server masks undeclared custom codes and the client types it closed, B an opt-in `closedLink()`, or C keep it open?
- **Q24.2** The closed set: A every built-in code (`defined: false`), or B a few folded categories?
- **Q24.3** Exhaustive matching: A `matchError(err, handlers)`, B A plus `.match()` on `safe()` results, or C none?
- **Q24.4** Shells: A boundary mode, B A plus a side-effect mode, C primitives only, or D not now?
- **Q24.5** Where shells live: A the framework-free half in `@trpc12/tanstack-query` and `createShell` per adapter, or B React only?
- **Q24.6** Boundary codes: A split `PARSE_ERROR` (`BAD_RESPONSE`), B also a client `TIMEOUT`, or C leave them?
- **Q24.7** Stale clients: A a router fingerprint, B a distinct unknown-path error, or C later?
- **Q24.8** Validate defined errors' `data` and rebuild tagged classes in `validationLink`: A yes, or B no?

## Decision

> Human: tick an answer per question (or write your own), add notes, and set **Status** to `accepted`.
> The agent then records it in `../decisions/` and links back here.

- **Q24.1:** [ ] A · [ ] B · [ ] C
- **Q24.2:** [ ] A · [ ] B
- **Q24.3:** [ ] A · [ ] B · [ ] C
- **Q24.4:** [ ] A · [ ] B · [ ] C · [ ] D
- **Q24.5:** [ ] A · [ ] B
- **Q24.6:** [ ] A · [ ] B · [ ] C
- **Q24.7:** [ ] A · [ ] B · [ ] C
- **Q24.8:** [ ] A · [ ] B
- **Notes:**
