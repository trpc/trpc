# Effect Type Performance

This harness measures deterministic TypeScript diagnostics for focused
fixtures. Type instantiations and materialized types are regression gates, while
symbols are reported for additional context.

Use it when a type-level change needs a small regression guard for the specific
type path that was optimized.

## Core Model

Each suite has one shared baseline. Fixture cost is reported separately for
instantiations, types, and symbols as:

```txt
metric delta = fixture metric - suite baseline metric
```

Threshold files store exact maximum deltas for instantiations and types. Symbol
deltas are informational and do not affect the command status.

The runner compiles each baseline and fixture as an isolated TypeScript program
by generating temporary `tsconfig` files under `tmp/typeperf`.

Fixtures must use realistic package imports:

```ts
import { Schema } from "effect"
```

Do not import source files directly, for example do not use
`../../src/Schema.ts`. The package self-reference should resolve the public
`effect` package entry.

Every fixture in a suite should repeat the suite warmup expression from
`baseline.ts`. For the current Schema suite, that means:

```ts
import { Schema } from "effect"

Schema.String
```

## Commands

From the repository root:

```sh
pnpm typeperf
pnpm typeperf schema
pnpm typeperf schema/struct-required
pnpm typeperf --update
pnpm typeperf schema/struct-required --update
```

Without a target, the runner checks every suite and fixture. A target can be a
suite name (`schema`) or an individual fixture (`schema/struct-required`).

`--update` writes exact measured instantiation and type deltas to threshold
files. When a target is provided, only the selected suite or fixture is updated.

## Cross-Ref Comparisons

Use the separate comparison runner when a changeset needs measurements against
another Git revision:

```sh
pnpm typeperf-compare httpapi --base main --head HEAD
pnpm typeperf-compare httpapi/endpoint-count-100 --base main --head HEAD
```

The runner creates detached worktrees under `tmp/typeperf-compare`, copies the
same generated fixture sources into both worktrees, and compiles them with the
TypeScript installation from the current checkout. Each fixture and baseline is
compiled once per revision. The normal `pnpm typeperf` suite and its thresholds
are not affected.

Comparison fixtures use only APIs shared by both revisions. They also contain
type-level assertions that reject degenerate results such as missing methods or
`never` endpoint selections. A fixture is comparable only when the exact same
source compiles on both revisions. Results are printed to the terminal and
written as JSON under `tmp/typeperf-compare/results/`, including the resolved
Git SHAs, TypeScript version, and fixture-suite hash.

## Adding A Fixture

Add a fixture when a change optimizes one specific constructor, helper, or
type-level path.

1. Create one file under the suite's `fixtures/` directory.
2. Name it after the isolated behavior being measured, for example
   `struct-optional-only.ts`.
3. Add a first-line comment explaining the single thing being measured.
4. Use realistic package imports.
5. Repeat the suite warmup expression.
6. Build only the schema needed for that one behavior.
7. Export type aliases that force TypeScript to instantiate the views under
   test.
8. Add the fixture to `config.json`.
9. Run `pnpm typeperf <suite>/<fixture> --update`.
10. Run `pnpm typeperf <suite>/<fixture>`.

Example:

```ts
// Measures the marginal type-level cost of Schema.Struct when all fields are optional keys.
import { Schema } from "effect"

Schema.String

const schema = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  count: Schema.optionalKey(Schema.NumberFromString)
})

export type Type = typeof schema.Type
export type Encoded = typeof schema.Encoded
export type Iso = typeof schema.Iso
export type MakeIn = typeof schema["~type.make.in"]
```

Then register it:

```json
{
  "name": "struct-optional-only",
  "file": "suites/schema/fixtures/struct-optional-only.ts"
}
```

### Fixture Rules

- Measure one thing per fixture. Split separate paths into separate files.
- Keep inputs realistic, but not large for its own sake.
- Export the minimum type aliases needed to force the type computation being
  measured.
- Do not combine multiple optimized APIs just to make the fixture look like an
  application model.
- Do not add fixtures for unchanged or unrelated APIs.
- Do not add fixture files to `packages/effect/tsconfig.json`; `pnpm typeperf`
  compiles them independently.
- If a fixture fails to compile, fix the fixture or source types. Do not hide
  the problem by aggregating it with another fixture.

## Adding A Suite

Add a suite when fixtures need a different shared baseline. For example,
Schema-specific fixtures share the `schema` baseline, while HTTP API fixtures
use a different import and warmup.

1. Create `suites/<suite-name>/baseline.ts`.
2. Create `suites/<suite-name>/fixtures/`.
3. Create `suites/<suite-name>/thresholds.json` with `{}`.
4. Add a suite entry to `config.json`.
5. Add at least one focused fixture.
6. Run `pnpm typeperf <suite-name> --update`.
7. Run `pnpm typeperf <suite-name>`.

Example suite entry:

```json
{
  "name": "schema",
  "baseline": "suites/schema/baseline.ts",
  "thresholds": "suites/schema/thresholds.json",
  "fixtures": [
    {
      "name": "struct-required",
      "file": "suites/schema/fixtures/struct-required.ts"
    }
  ]
}
```

The baseline should contain only the import and warmup common to every fixture in
that suite. If a fixture needs extra setup that others do not need, put that
setup in the fixture, not in the shared baseline.

## Updating Thresholds

Use `--update` only after verifying that the measured delta is expected.

```sh
pnpm typeperf schema/struct-required --update
pnpm typeperf schema/struct-required
```

`--update` writes the exact measured deltas as `maxInstantiationsDelta` and
`maxTypesDelta`. It does not add a margin:

```json
{
  "struct-required": {
    "maxInstantiationsDelta": 457,
    "maxTypesDelta": 50
  }
}
```

## Validation Checklist

After adding or changing fixtures:

```sh
pnpm typeperf <suite>/<fixture> --update
pnpm typeperf <suite>/<fixture>
pnpm exec dprint check package.json packages/effect/typeperf
```

Run the broader suite when the change touches shared runner behavior:

```sh
pnpm typeperf <suite>
```
