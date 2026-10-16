# Inputs come from zod schemas, not hand-written types (human)

- In the docs (`www/content`) and `examples/`, search params, route params, and server function / API inputs are zod schemas, and their types are inferred (`validateSearch: Schema`, `z.infer<typeof Schema>`). Don't write a `type XSearch = { ... }` beside a hand-rolled validator.
- Reason: one declaration gives the validator and the type, and it reads more clearly than a type alias plus a parsing function.
- The examples' schemas live in `examples/.shared/db/src/types.ts`. Both apps import them from there.
