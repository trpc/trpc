# Published source uses `isolatedDeclarations` (human)

- Alex, 2026-10-15 (decisions round 3, Q17 = proposal 01 Q1.5): "A".
- Every published package (`packages/*`) compiles with `isolatedDeclarations: true` (and `declaration: true`): every export spells out its type.
- (agent) Turned on now, not when `vp pack` is wired. Measured on 2026-10-15: 47 errors, 42 of them in `src/serializer/std.ts`.
- (agent) Tests, examples and test fixtures are exempt; only published source.
- Why: per-file `.d.ts` emit for `vp pack` (tsdown/oxc); every public type is named and exported, which backs the portability rules (no TS2742 for users); public type changes show in review.
- Lost: brevity; exported helpers need explicit annotations.
- Lives in: `packages/*/tsconfig.json`; the `pnpm typecheck` gate enforces it.
