# Every input is validated; no `type<T>()` (human)

- Human, 2026-10-09 (Q5.2): "I want to kill any support for that as I also want inputs to be able to have callback where we get the context etc so you can do context aware stuff in the validators." No `type<T>()` helper and no other unvalidated form: v11's plain `(input) => output` parsers are gone too.

  ```ts twoslash
  // @errors: 2304 2769
  // ---cut-start---
  import { z } from 'zod';
  import { t } from './server.ts';
  // ---cut-end---
  t.procedure.input(type<{ id: string }>()); // ❌ no such helper
  t.procedure.input((raw: unknown) => raw as { id: string }); // ❌ not a parser any more
  t.procedure.input(z.object({ id: z.string() })); // ✅
  ```

- Why: `.input()` keeps one meaning, a schema that validates, and the function form is free for a context-aware callback.
- Lost: a zero-cost "trust me" input for internal procedures and contracts; `type<T>()` as a pass-through Standard Schema (05's recommendation); plain-function parsers (V-C).
- Human, 2026-10-15 (Q5.4): "Yes", and "those validation errors should be inferrable automatically". Input validation errors include `data.issues` (`{ path, message }[]`) in every environment, and any procedure with an `.input()` has a defined `BAD_REQUEST` with typed `issues` in its error union.
- (agent, Q5.1) V-A: Standard Schema and Effect Schema only.
- (agent, Q5.3) C-A: inputs chain. Each schema sees the raw input, and object outputs are merged.
- (agent, Q5.6) D-A: `.input(({ ctx, meta, path }) => schema)` is the context-aware form ([`../notes/context-aware-inputs.md`](https://github.com/trpc/trpc/blob/d5c34c43000547776ca234ac47edafd48370e6fd/next/.agent-docs/notes/context-aware-inputs.md)). D-C (Effect Schema services) works too, because inputs are decoded with the procedure's provided services.
- Lives in: `packages/trpc/src/server/validation/schema.ts`, `src/server/procedures/builder.ts`.
