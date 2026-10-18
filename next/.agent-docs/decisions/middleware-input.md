# Middleware can replace the input (human)

- Human, 2026-10-15 (issues review Q5, #6892): "A". `next({ input })` is typed like `next({ ctx })`: the procedures after it see the new input type.
- (agent) The replaced input is what later steps and the resolver receive. Unlike `ctx`, it replaces rather than merges, because inputs aren't always objects. A later `.input()` still parses the raw call input, as every `.input()` does, and merges its result over the replaced input when both are objects.
- (agent) `next({ ctx })` and `next({ input, ctx? })` are separate overloads: a single generic with an optional `input` picked up `undefined` from the contextual return type.
- Lost: the guarantee that the resolver's input is exactly what the parser produced.
- Lives in: `packages/trpc/src/server/procedures/middleware.ts`, `src/server/execution/execute.ts`, `src/server/procedures/builder.ts`, `src/server/procedures/implement.ts`.
