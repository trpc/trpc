# Agents (`next/`)

## Rewrite in progress

This repo is a **from-scratch rewrite** of tRPC (vNext / `v12` branch), not maintenance of current tRPC.

**New code lives here, in `next/`.** Do not add vNext packages to the repo-root `packages/`, `examples/` or `www/` trees (that is leftover v11). Design docs live in [`.agent-docs/`](./.agent-docs/).

Start here (paths relative to `next/`):

- `.agent-docs/decisions/brief.md` — the brief and founding constraints
- `README.md` — implementation root layout and commands
- `.agent-docs/approach.md` — process, principles, phases
- `.agent-docs/README.md` — proposal index and how to decide
- `.agent-docs/proposals/` — API proposals (options + recommendations; a human decides)
- `.agent-docs/decisions/` — one file per decided topic, titled `(human)` or `(agent)`; overrides proposals (`pnpm decisions` lists and searches them; `--who agent` shows the unreviewed calls)
- `.agent-docs/reference/` — oRPC parity, v11 inventory, prior art
- `.agent-docs/notes/` — spike results and research
- `spikes/` — throwaway prototypes backing the notes

Search `.agent-docs/` before designing or implementing. Do not silently diverge from a recorded decision, and don't reverse a `(human)` one without asking. A new decision is a new `decisions/<topic>.md`, not an addition to an existing file or an index; the format is in `.agent-docs/README.md#decisions`. Do not fill Decision blocks in proposals; humans record decisions.

All logic is written in Effect, including tooling, scripts, tests' helpers and spikes ([`decisions/effect-native-by-default.md`](./.agent-docs/decisions/effect-native-by-default.md), the [brief](./.agent-docs/decisions/brief.md)). The exceptions are public APIs that promise users a Promise surface, and code whose host fixes the shape (an oxlint rule's visitor object); keep Effect behind those. Spike scripts share `spikes/kit.ts` (fixtures through `FileSystem`, `tsc` through `ChildProcessSpawner`, commands through `effect/cli`).

Agent skills live in the repo-root `.agents/skills/<name>/SKILL.md` (for example `decision-round`). Never use `.cursor/`.

## Running

`next/` is its own pnpm workspace. Node is pinned in `.nvmrc` (same version as the repo-root `.nvmrc`). From `next/`:

```bash
nvm use
pnpm install
pnpm test
pnpm example
```

`pnpm typecheck` and `pnpm check` are the other local gates (`pnpm fix` autofixes). Commands are listed in `README.md`; run every gate listed there before pushing, then watch the `next.yml` run with `gh run watch <id> --exit-status`. If `node -v` is not 24.x, run `nvm use` before install or test.

## Docs

User docs are Markdown in `docs/`, one short page per topic in a folder per sidebar section; `www/` renders them as the site ([`decisions/docs-website.md`](./.agent-docs/decisions/docs-website.md)). Update the page a change affects, in the same commit.

- Every page needs `title`, `description`, `section` (one of `sections` in `www/src/site.ts`) and `order` in its frontmatter. List a new page in `docs/README.md`.
- Where a page's v11 topic is at another slug, name the v11 page in its frontmatter (`v11: server/data-transformers`); the version banner and switcher link the two. The v11, v10 and v9 docs are generated copies in `www/v11/`, `www/v10/` and `www/v9/`, and so is the blog in `www/blog/`: don't edit them, rerun `pnpm --filter @trpc12/www old-docs:copy` ([`decisions/old-docs-copy.md`](./.agent-docs/decisions/old-docs-copy.md)).
- Link pages with relative `.md` links (`../client/links.md#query-urls`); the build fails on a missing page or heading.
- Prefer `ts twoslash` blocks: they compile in `www/samples/docs` (import its `./server.ts` and `./client.ts`, hiding the setup between `// ---cut-start---` and `// ---cut-end---`), and `// ^?` shows a type. An undeclared type error fails the build.
- `pnpm docs:dev` serves the site; `pnpm docs:build` is the check. Compiled blocks are cached in `www/node_modules/.cache/twoslash`.
- The site's components are vanilla shadcn in `shared/ui` (`@shared/ui`), installed by its CLI: don't edit them, reinstall (`pnpm dlx shadcn@4.21.4 add <name> --overwrite` in `shared/ui`). Brand colors live only in its `src/styles/globals.css` ([`decisions/shadcn-lib-and-branding.md`](./.agent-docs/decisions/shadcn-lib-and-branding.md)).
- The site is set up for Vercel, deployed from `v12` and never from `main` ([`decisions/docs-website-on-vercel.md`](./.agent-docs/decisions/docs-website-on-vercel.md)). It renders `docs/` and its workspace dependencies: if it starts reading another path, add that path to `inputs` in `tooling/vercel-ignore/src/bin/ignore.ts`, or deployments skip changes to it.

## Tests

- No `beforeEach`/`afterEach` (`vitest/no-hooks`). Clean up with `using`/`await using`: a helper returns a `Disposable` that undoes its setup, for example `using _db = freshDb();` from `packages/trpc/src/fixtures/posts.ts`.
- `vite.config.ts` sets `unstubGlobals: true` and `restoreMocks: true`; don't restore stubs or mocks by hand.
- No `vi.mock` (`trpc/no-mock`) and no custom timeouts (`trpc/no-custom-test-timeout`). Make a slow test fast instead.
- `vitest/expect-expect`, `no-conditional-expect` and `no-standalone-expect` are off on purpose; the reasons are beside them in `vite.config.ts`.

## Lint and style

Custom rules are in `tooling/oxlint-plugin/` (see its `AGENTS.md`). Never write `eslint-disable` comments: fix the code, or scope the rule with an override in `vite.config.ts` and a comment saying why.

Effect code follows the `anti-slop-effect` rules. Build tagged values with `Data.taggedEnum` or tagged classes, not `{ _tag: … }` literals. Test them with `Predicate.isTagged`, `Option.isSome`/`isNone` or `Result.isFailure`, not by comparing `_tag`; recover with `Effect.catchReason`, not by branching on `err.reason._tag`. Use `Match` or a `Record` lookup instead of chained literal ternaries. In tests, assert with `expect(x).toSatisfy(Predicate.isTagged('X'))` or `toBeInstanceOf`, not `toMatchObject({ _tag })`.

Destructuring (`trpc/no-overzealous-destructuring`, also checked in `docs/` code blocks by `pnpm lint:docs`): take one parameter and read its members, named `opts` by default, `args` where `opts` would shadow, and `props` for components. Destructure only keys read three or more times. Name a call's result instead of destructuring it (`const serialized = serializeDeferred(…)`). After a bulk codemod, compare `eslint/no-shadow` counts before and after, and check that renamed locals don't collide with existing functions.

## Vendored Source

Source for this project's key dependencies is vendored under `.repos/`, pinned to the installed versions. When a question is about how one of these libraries actually behaves, read its vendored source — implementation, tests, examples — instead of relying on docs, memory, or web search. The trees are read-only reference material; see `.repos/AGENTS.md` before touching or citing them.

### Vendored packages

- `effect` (ref `effect@4.0.2`) → `.repos/effect`
- `orpc` (ref `v2.0.0-beta.44`) → `.repos/orpc`
- `raf-query` (ref `a9f2aa77`, 0.11.1) → `.repos/raf-query`

Managed by [vendor-src](https://www.npmjs.com/package/vendor-src), a devDependency of this workspace. Its config has to live at the repo root (`../vendor-src.json`, `"dir": "next/.repos"`), because vendor-src looks for the nearest directory with both `.git` and `package.json`. `rootAgentsMd` is off, so keep the list above in sync by hand when adding or bumping a vendored repo.

Every repo is git-only (`"packages": []`): vendor-src resolves installed packages from the repo root, where v11's dependencies live, so it can't tie a checkout to this workspace's lockfile. `vendor-src check` (run by `pnpm install`) skips git-only repos. `pnpm vendor:sync [name…]` moves each to its newest upstream ref: a tag to the highest tag with the same prefix (`effect@4.0.2` follows `effect@*`; prereleases only from a prerelease), a SHA (`raf-query`) to the default branch's `HEAD`.

So sync `effect` and `orpc` only when bumping their installed versions to the same release, and sync other repos by name (`pnpm vendor:sync raf-query`). `vendor-src add` needs a clean working tree and creates `git subtree` merge commits. Sync needs only the checkouts it touches to be clean, and commits the new tree and the pruned `ignore` paths itself. Then commit `../vendor-src.json` (`.repos/AGENTS.md` is rewritten for you) and update the list above by hand.
