# Agent instructions

`main` is tRPC v11. v12 is a rewrite on the [`v12`](https://github.com/trpc/trpc/tree/v12) branch, with its own `AGENTS.md`. Agent skills go in `.agents/skills/<name>/SKILL.md`; don't add a `.cursor/` folder.

## Commands

Run them from the repo root.

- Test one file: `pnpm vitest run <file>`. Not `pnpm test -- <file>`: pnpm passes the `--` on, and Vitest then ignores the filter and runs the whole suite.
- Tests import `@trpc/*` from source, so they don't need `pnpm build`.
- Typecheck: `pnpm typecheck-packages`. Lint and format: `pnpm lint-fix`.
- Docs code blocks: `pnpm --filter www check-twoslash`.

## Layout

- `packages/*`: the published `@trpc/*` packages. Most integration tests are in `packages/tests/server/`.
- `packages/server/src/unstable-core-do-not-import/`: the shared core.
- `www/v11/docs/<path>.md`: the docs, served at `/docs/<path>`. `www/v10/` and `www/v9/` are older versions.
- `packages/*/skills/` are generated from docs frontmatter when packing; edit the docs page instead.

## Changes

- Every bug fix comes with a regression test that fails without the fix. Check that it does before you push.
- Test through a real client and server, not mocks: `await using ctx = testServerAndClientResource(router)` from `@trpc/client/__tests__/testClientResource`. The React packages each have their own helpers; copy the setup from the nearest test.
- Add tests; don't rewrite existing ones to fit your change.
- No behaviour-changing defaults in v11: add an opt-in option or docs, and put the new default in v12. Port v11 fixes to the `v12` branch.
- Update the docs page a change affects in the same PR.

## TypeScript

Lint enforces most of the style (`.oxlintrc.json`, `tooling/oxlint-plugin/`). Beyond it, adapted from pstack's [type system discipline](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-type-system-discipline/SKILL.md) and [TypeScript best practices](https://github.com/cursor/plugins/blob/main/pstack/skills/typescript-best-practices/SKILL.md), make impossible states fail to compile:

- Prefer required over optional. Internal (non-exported) parameters, properties and options aren't optional: pass an explicit `null`, a literal string or a symbol. Optionals are only for the convenience of public APIs.
  ```ts
  function connect(url: string, retry?: RetryOptions); // before
  function connect(url: string, retry: RetryOptions | null); // after
  ```
- Model variants as a discriminated union on a literal field, not booleans plus optional fields.
- Brand a primitive when two values of its type mean different things: `string & { __brand: 'TrackedId' }`, as in `stream/tracked.ts`.
- Data from outside (request bodies, headers, messages) is `unknown` until parsed at the boundary; trust the type after that. `any` is fine in generic constraints such as `AnyRouter`.
- Let TypeScript infer, and derive types from whatever owns the shape (`typeof`, `ReturnType`, `inferRouterInputs`) before declaring a parallel one. Declare return types only on public APIs.
- Check a value with `satisfies`, not `as`; cast only after validating. A type guard (`isX`) must check what its name claims.
- Take one options object, `opts`, and read its members. Destructure only keys read three or more times.
- Clean up with `await using` and `makeResource()` or `makeAsyncResource()`, not `try`/`finally`.

## Pull request bodies

Fill in [the PR template](.github/PULL_REQUEST_TEMPLATE.md) and keep it short enough to read once.

- Stay under 200 words, not counting code blocks and links. Most PRs need far fewer.
- Use bullets, not walls of prose. No preamble, credits or design essays.
- Say what changed and why, not what changed in each file.
- Put each closing keyword on its own bullet (`- Closes #123`), never several issues on one line.
- For a bug fix, Testing has one `Regression check:` line naming the test that fails without the fix. Don't repeat test lists or list every suite you ran.
- If an AI model helped, name it under AI model.
- Describe the PR as it is now. No review-round history, earlier revisions or approaches you dropped; edit the body instead of appending.
- Put detail where it lasts: a code comment for a constraint the code can't show, a commit message for the reasoning behind a change, the docs for usage.
