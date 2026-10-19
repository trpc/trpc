# Client calls take the input, then options (human)

- Answers Q16.1 (proposal 16) with CS-A, v11's shape: `client.post.byId.query(input, { signal, ...linkOptions })`, `mutate(input, opts)`, `subscribe(input, opts)`. Link-declared options sit directly on the second argument ([`client.md`](./client.md), Q16.2).
- Why: v11 users keep their call sites (the codemod changes none), and a procedure without input still reads `query()`. A single bag (CS-B) would put `input` next to option names links can declare.
- Lost: one object for everything, which oRPC also doesn't use.
- Human, 2026-10-16 (Q16.1, decision round): "A, might change my mind".
- Human, 2026-10-19 (Q16.1, decision round): "A". Asked whether to keep `query(input, options)` and drop the tentative flag, switch to one object, or stay tentative: the shape is settled.
- Lives in: `packages/trpc/src/client/types.ts`, `src/client/index.ts`.
