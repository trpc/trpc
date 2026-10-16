# Bundle Size Development Workflow

This package contains the internal bundle-size tooling used to measure Effect
entrypoints with Rollup, minification, and gzip.

## AI Agent Instructions

Use this workflow when a user wants to quickly understand how a local source
change affects bundle size for one or more explicitly selected fixture files.

Do not scan `scratchpad/` or `packages/tools/bundle/fixtures/` for this workflow.
Only measure files that the user explicitly names, or files you create
specifically for the current investigation.

Use the default cleanup mode. Pass `--keep-base` only when repeated measurements
are explicitly requested or clearly necessary, then clean up after the final
run.

If the user asks what a generated bundle is made of, use the bundle composition
workflow instead of the size comparison workflow.

### Analyze Bundle Composition

Use this workflow when the user gives an explicit fixture and wants to
understand which modules make up the produced bundle.

Agent procedure:

1. Confirm the exact fixture path or paths to analyze. Do not scan directories.
2. Run `pnpm bundle-analyze` with only those explicit paths.
3. Read the printed Markdown table and identify the generated `*.raw-data.json`
   path for each fixture.
4. Analyze `*.raw-data.json` first. Use `*.treemap.html` only when the user wants
   a visual artifact to open.
5. Report the largest modules, notable dependency groups, and any surprising
   inclusions. Mention the generated artifact paths in the answer.

Prefer the repository-level wrapper:

```sh
pnpm bundle-analyze scratchpad/my-fixture.ts
```

You can pass multiple explicit files:

```sh
pnpm bundle-analyze \
  scratchpad/schema-codec.ts \
  scratchpad/schema-arbitrary.ts
```

The wrapper builds the current checkout with `pnpm build` before generating
analysis artifacts, so the bundle is not produced from stale `dist` files.

By default, artifacts are written to `tmp/bundle-analysis`. Use `--output-dir`
to choose another directory:

```sh
pnpm bundle-analyze --output-dir tmp/schema-analysis scratchpad/my-fixture.ts
```

For each selected fixture, the tool writes:

- `<name>.min.js`: the generated Rollup output for inspection;
- `<name>.treemap.html`: an interactive treemap for human inspection;
- `<name>.raw-data.json`: raw visualizer data suitable for AI analysis.

The analysis build disables identifier mangling so module and export names stay
readable in the visualizer output. Use `bundle-compare-selected` or `report`
when exact size measurement is the goal.

After running the command, inspect the Markdown table it prints to find the exact
paths. For an AI analysis, read the `*.raw-data.json` file first and summarize
the largest modules and dependency groups. Use the `*.treemap.html` file when
the user wants to inspect the bundle visually.

The raw data contains a tree plus module metadata. For a quick size-oriented
summary, rank module parts by `renderedLength` or `gzipLength`, then map each
part through `metaUid` to `nodeMetas[metaUid].id`.

Example inspection command:

```sh
node -e 'const data = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log(Object.entries(data.nodeParts).map(([uid, part]) => ({ uid, id: data.nodeMetas[part.metaUid]?.id, rendered: part.renderedLength, gzip: part.gzipLength })).sort((a, b) => b.rendered - a.rendered).slice(0, 20))' tmp/bundle-analysis/my-fixture.raw-data.json
```

Do not treat the generated `.min.js` size from this workflow as the exact bundle
size comparison number. The analysis build keeps names readable for the
visualizer. Use `bundle-compare-selected` or `report` for exact size reporting.

Do not use this workflow to compare against a base ref. Use
`bundle-compare-selected` for size impact and `bundle-analyze` for current bundle
composition.

### Compare Explicit Scratchpad Fixtures

Prefer the repository-level wrapper:

```sh
pnpm bundle-compare-selected --base main scratchpad/my-fixture.ts
```

You can pass multiple explicit files:

```sh
pnpm bundle-compare-selected --base main \
  scratchpad/schema-codec.ts \
  scratchpad/schema-arbitrary.ts
```

If `--base` is omitted, the script compares against `main`.

By default, the wrapper removes `tmp/bundle-base` before exiting, including on
failure. This avoids leaving extra git worktree state after a one-off
measurement.

For repeated measurements where the user explicitly wants a faster feedback loop,
pass `--keep-base`:

```sh
pnpm bundle-compare-selected --base main --keep-base scratchpad/my-fixture.ts
```

When using `--keep-base`, clean up `tmp/bundle-base` after the last measurement.
The explicit final cleanup command is:

```sh
git worktree remove --force tmp/bundle-base
```

The wrapper:

- builds the current checkout with `pnpm build`;
- creates or reuses `tmp/bundle-base` at the requested base ref;
- builds the base checkout when needed and writes
  `tmp/bundle-base/.bundle-build-stamp` only after a successful build;
- reuses a kept base checkout only when its HEAD and `.bundle-build-stamp`
  both match the requested base ref;
- copies only the selected files into the base checkout at the same relative
  paths;
- invokes the internal bundle CLI to compare current vs base sizes.

The selected files are copied into the base checkout so the report isolates
source changes instead of changes to the fixture text.

Expected output is a Markdown table:

```md
| File Name                  | Current Size | Previous Size |    Difference     |
| :------------------------- | :----------: | :-----------: | :---------------: |
| `scratchpad/my-fixture.ts` |   42.10 KB   |   40.80 KB    | +1.30 KB (+3.19%) |
```

### Internal CLI

Use the internal CLI directly only when the base checkout is already prepared
and built:

```sh
node packages/tools/bundle/src/bin.ts compare-selected \
  --base-dir tmp/bundle-base \
  scratchpad/my-fixture.ts
```

The `--base-dir` value must be the root of the base checkout, not the base
fixture directory.

### Current Size Only

If the user only asks for the current bundled size, use:

```sh
pnpm build
pnpm --dir packages/tools/bundle report ../../../scratchpad/my-fixture.ts
```

Run the build immediately before the report because the direct CLI resolves
Effect packages from `dist`. This does not compare against a base ref.

### Fixture Guidance

Keep temporary fixtures in `scratchpad/`.

Good temporary fixtures are small, focused entrypoints that import public
package APIs:

```ts
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const schema = Schema.Struct({
  name: Schema.String
})

Schema.decodeUnknownEffect(schema)({ name: "effect" }).pipe(Effect.runFork)
```

Prefer self-contained fixtures. The compare-selected workflow copies only the
explicit entry files into the base checkout. If a fixture imports local relative
helpers, either avoid that shape or make the entry fixture self-contained before
measuring.

Do not add temporary fixtures to `packages/tools/bundle/fixtures/`. That
directory is for stable comparison fixtures used by the regular bundle-size
workflow.

### Cleanup

The wrapper cleans up `tmp/bundle-base` by default. If `--keep-base` was used for
a multi-run investigation, remove the worktree when the user is done.

To remove it:

```sh
git worktree remove --force tmp/bundle-base
```

To verify that cleanup succeeded:

```sh
git worktree list
```

Only the main repository worktree should remain.
