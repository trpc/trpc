# Client calls take the input, then options (human)

- Answers Q16.1 (proposal 16) with CS-A, v11's shape: `client.post.byId.query(input, { signal, ...linkOptions })`, `mutate(input, opts)`, `subscribe(input, opts)`. Link-declared options sit directly on the second argument ([`client.md`](./client.md), Q16.2).
- Why: v11 users keep their call sites (the codemod changes none), and a procedure without input still reads `query()`. A single bag (CS-B) would put `input` next to option names links can declare.
- Lost: one object for everything, which oRPC also doesn't use.
- Human, 2026-10-16 (Q16.1, decision round): "A, might change my mind".
- Tentative (human): "might change my mind". Challenge it when it gets in the way.
- Lives in: `packages/trpcdev/src/client/types.ts`, `src/client/index.ts`.
