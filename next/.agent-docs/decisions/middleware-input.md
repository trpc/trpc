# Middleware can replace the input (human)

- Alex, 2026-10-15 (issues review Q5, #6892): "A". `next({ input })` is typed like `next({ ctx })`: the procedures after it see the new input type.
- (agent) The replaced input is what later `.input()` parsers and the resolver receive. Unlike `ctx`, it replaces rather than merges, because inputs aren't always objects.
- Lost: the guarantee that the resolver's input is exactly what the parser produced.
- Lives in: `packages/trpcdev/src/server/middleware.ts`, `src/server/procedure.ts`.
