# Closed error unions and error shells, proposed (agent)

- Human, 2026-10-18: "What sort of thing are we missing from "errors as values" that https://result-rpc.com/ does?", then "Add some stuff to proposals and Spike stuff about this".
- (agent, tentative) The recommended picks in [proposal 24](../proposals/24-error-ownership.md), until the human answers:
  - Q24.1: the server masks thrown, undeclared custom codes as `INTERNAL_SERVER_ERROR`, and the client's `defined: false` part becomes `BoundaryError`, one member per built-in code.
  - Q24.2: the closed set is every built-in code, not folded categories.
  - Q24.3: `matchError(err, handlers)` in `@trpc12/trpc/client`. Every defined code is required, plus `unexpected` while anything undefined is left.
  - Q24.4: shells in boundary mode. A shell's hooks throw owned errors to the nearest owning `Boundary` and type `error` without them. The side-effect mode stays open.
  - Q24.5: the claim predicate, `Remaining` and the `throwOnError` transform in `@trpc12/tanstack-query`; `createShell` in `@trpc12/tanstack-react-query` first.
  - Q24.6: `PARSE_ERROR` is split, and a foreign or undecodable response becomes a client-side `BAD_RESPONSE`.
  - Q24.7: stale-client detection is later.
  - Q24.8: no client-side validation of error `data` yet.
- Why: a component's `error` lists only what it must handle, and app-wide failures are owned once. The spikes ([closed-error-unions](../notes/closed-error-unions.md), [error-shells](../notes/error-shells.md)) found two things:
  - undeclared custom codes are the only thing keeping the union open;
  - shells need no TanStack changes.
- Lost: thrown custom codes reaching the client untyped. With boundary mode, an owned mutation error unmounts the form.
- Shipped: Q24.1 A, Q24.2 A, Q24.3 A and part of Q24.6 A, when the human asked for a foolproof client error API ([closed-client-errors](./closed-client-errors.md)). `matchError`'s catch-all is `unexpected` since [exhaustive-match-error](./exhaustive-match-error.md) (`builtin` before). Q24.1's masking now applies only to procedures with `.errors()` ([thrown-errors-and-exhaustive-declarations](./thrown-errors-and-exhaustive-declarations.md)).
- Open: shells (Q24.4, Q24.5), stale clients (Q24.7) and error data on the client (Q24.8) await the human's answers to proposal 24.
- Lives in: `proposals/24-error-ownership.md`, `spikes/closed-errors/`, `spikes/error-shells/`.
