# Client calls take the input, then options (agent)

- Answers Q16.1 (proposal 16) with CS-A, v11's shape: `client.post.byId.query(input, { signal, ...linkOptions })`, `mutate(input, opts)`, `subscribe(input, opts)`. Link-declared options sit directly on the second argument ([`client.md`](./client.md), Q16.2).
- Why: v11 users keep their call sites (the codemod changes none), and a procedure without input still reads `query()`. A single bag (CS-B) would put `input` next to option names links can declare.
- Lost: one object for everything, which oRPC also doesn't use.
- Lives in: `packages/trpcdev/src/client/types.ts`, `src/client/index.ts`.
