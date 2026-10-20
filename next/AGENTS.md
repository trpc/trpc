# Agents (`next/`)

## Rewrite in progress

This repo is a **from-scratch rewrite** of tRPC (vNext / `v12` branch), not maintenance of current tRPC.

**New code lives here, in `next/`.** Do not add vNext packages to `../v11/` (the v11 monorepo: `packages/`, `examples/`, `www/`). Design docs live in [`.agent-docs/`](./.agent-docs/).

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

`next/` is its own pnpm workspace. Node is pinned in `.nvmrc` (same version as `../v11/.nvmrc` and the repo root's `../.nvmrc`; bump all three together). From `next/`:

```bash
nvm use
pnpm install
pnpm test
pnpm example
```

`pnpm typecheck` and `pnpm check` are the other local gates (`pnpm fix` autofixes). Commands are listed in `README.md`; run every gate listed there before landing. If `node -v` is not 24.x, run `nvm use` before install or test.

- `pnpm test <file or folder>` runs only those tests, and so does `pnpm test -- --watch false <file>`. Tests run through `vp test`; there is no `vitest` binary.
- Import test APIs from `vite-plus/test`, or from `@effect/vitest` in a package that depends on it, never from `vitest` (lint fails on it). No package here depends on `vitest`: a checkout with a v11 install in `../node_modules` resolves it from there, and CI doesn't. The same goes for any package a `package.json` here doesn't list.
- Cloud Agents' `core.hooksPath` is Cursor's, so `pnpm install` skips `.vite-hooks` and `pre-commit` doesn't run: run `pnpm fix` before committing.
- `pnpm example` needs Redis and Postgres for `examples/realtime`, at CI's `REDIS_URL` and `DATABASE_URL` (in `../.github/workflows/next.yml`).

`pnpm bench budget` measures only the tree-shaken standard client (`httpLink`, plus `retryLink` and danSON); opt-in links and utilities such as `dedupeLink` only have to shake out of it, so don't bend their design for bundle size ([`decisions/orpc-v2-parity.md`](./.agent-docs/decisions/orpc-v2-parity.md)).

## Landing on `v12`

Many agents push to `v12` at once, about a hundred commits a day, so a change that waits drifts into conflicts.

- Push straight to `v12` and don't open pull requests against it, cloud agents included, whose default is a branch and a draft PR. Commit in small semantic commits, as the [brief](./.agent-docs/decisions/brief.md) says, and land them with `pnpm land`: no feature branch, no force push, no merge commits. Only when a human explicitly asks for a pull request, open one, land it squashed onto the latest `v12` as soon as it's green, and close it.
- Name every branch cut from `v12` `v12-<name>`, cloud agents' included (not `cursor/…`): `trpc-v12` builds previews only for `v12-*` ([`docs-website-on-vercel.md`](./.agent-docs/decisions/docs-website-on-vercel.md)).
- Rebase (`git pull --rebase origin v12`) before the gates, so they run on what you'll push.
- `pnpm land` lands the current branch's commits, from `v12` or a worktree's branch: it rebases onto `origin/v12`, reinstalls when that brought in a manifest change, checks the files your commits change with `vp check`, pushes to `v12`, and rebases again when the push is rejected. On a conflict in `pnpm-lock.yaml` alone it takes `v12`'s and reinstalls; on any other it stops mid-rebase: resolve it, `git rebase --continue`, and rerun `pnpm land` ([`landing-on-v12.md`](./.agent-docs/decisions/landing-on-v12.md)).
- Don't watch your own `next.yml` run: a newer push often replaces it before it starts. `pnpm ci:wait` waits for the first finished run that includes your commit (HEAD, or the one you name) and lists the failed jobs.
- Don't `git stash` in a checkout with worktrees: they share one stash, and `git stash pop` can take a sibling's changes. Commit work in progress, or copy the files aside.
- `AGENTS.md`, `README.md`, `.agent-docs/README.md` and `vite.config.ts` are shared by most changes. Edit as little of them as you can: put the detail in the decision file, skill, page or code it's about, and add one line to the shared file that links it. Say a fact in one place and link to it elsewhere; a fact restated in `AGENTS.md`, `README.md` and a decision is three edits for the next change and three chances to conflict.
- Git conflicts by line, and a Markdown bullet or paragraph is one line: two changes to different sentences of one bullet conflict. Give a new topic its own bullet instead of adding sentences to another topic's, and split a bullet that has grown several topics.
- Resolving a `pnpm-lock.yaml` conflict by hand, take `v12`'s (`git checkout origin/v12 -- pnpm-lock.yaml`), run `pnpm install`, and commit the result. Don't merge the lockfile line by line.

## Docs

User docs are Markdown in `www/docs/`, one short page per topic in a folder per sidebar section, which the site in `www/` renders ([`decisions/docs-website.md`](./.agent-docs/decisions/docs-website.md), [`decisions/docs-in-www.md`](./.agent-docs/decisions/docs-in-www.md)). Update the page a change affects, in the same commit.

- Every page needs `title`, `description`, `section` (one of `sections` in `www/src/site.ts`) and `order` in its frontmatter; the sidebar and `llms.txt` list it from those, so there's no index to update.
- `experiment: <id>` in the frontmatter (one of `www/src/experiments.ts`) puts a page that waits for review in an experiment: it's served at its URL but `noindex`, out of the sitemap and `llms.txt`, and out of the sidebar and search until the experiment is on (the Experiments menu, `?flags=<id>`, or opening one of its pages). The build fails when a listed page links to it ([`decisions/docs-experiments.md`](./.agent-docs/decisions/docs-experiments.md)).
- Where a page's v11 topic is at another slug, name the v11 page in its frontmatter (`v11: server/data-transformers`); the version banner and switcher link the two.
- The v11, v10 and v9 docs are generated copies in `www/v11/`, `www/v10/` and `www/v9/`, and so are the home page's v11 code steps in `www/v11/home/` and the blog in `www/blog/`: don't edit them, rerun the copy. Nothing reruns it automatically: after merging `main` into `v12`, or when asked to sync the old docs, follow [`.agents/skills/sync-old-docs/SKILL.md`](../.agents/skills/sync-old-docs/SKILL.md) ([`decisions/old-docs-copy.md`](./.agent-docs/decisions/old-docs-copy.md)). The v11 docs' Twoslash blocks compile in `www/samples/v11`, against the `@trpc/*` canary it pins.
- The same copy writes trpc.io's redirects to `www/trpc-io-redirects.json`; the build redirects every old trpc.io URL to its page here and fails on one that lands nowhere ([`decisions/old-urls-and-seo.md`](./.agent-docs/decisions/old-urls-and-seo.md)). `www/old-docs.json` says where each old doc, post, partial and image went, and the copy fails on a file under `v11/www/docs`, `v11/www/versioned_docs` or `v11/www/blog` it neither copies nor lists in `notCopied`. `old-docs:check` fails when the copies aren't what the copy writes; nothing runs it but the sync.
- The sponsors in `www/sponsors.json` and the root `README.md`'s sponsors section are written by `pnpm --filter @trpc12/www sponsors:sync` (needs KATT's `SPONSORS_SYNC_GITHUB_TOKEN`, or asks for it; `sponsors:readme` redoes the README from `sponsors.json`), and by `.github/workflows/next-sponsors.yml` daily when a sponsor joined, left or changed tier: don't edit them by hand ([`decisions/docs-sponsors.md`](./.agent-docs/decisions/docs-sponsors.md)). After merging `main` into `v12`, the `post-merge` hook reruns `sponsors:readme` when `README.md` changed; commit what it writes.
- Put package names, import paths and code (`@trpc12/trpc/server`, `t.concat()`, `httpLink`, `ctx`) in backticks, in the frontmatter's `title`, `label` and `description` too: the site renders them as code and strips them for meta tags and `llms.txt`. `pnpm lint:docs` fails on bare ones and `pnpm lint:docs --fix` wraps them ([`tooling/docs-lint/bare-code.ts`](./tooling/docs-lint/bare-code.ts)).
- Link pages with relative `.md` links (`../client/links.md#query-urls`); the build fails on a missing page or heading.
- Everywhere else (package and example READMEs, `.agent-docs/`, codemod messages), link a page by its URL on the site, `https://v12.trpc.io/v12/docs/<slug>` (`site.url` and `v12.basePath` in `www/src/site.ts`), not by its path; `tooling/pack/docs.test.ts` checks the package READMEs' links.
- Prefer `ts twoslash` blocks: they compile in `www/samples/docs` (import its `./server.ts` and `./client.ts`, hiding the setup between `// ---cut-start---` and `// ---cut-end---`), and `// ^?` shows a type. An undeclared type error fails the build.
- `pnpm docs:dev` serves the site; `pnpm docs:build` is the check. Compiled blocks are cached in `www/node_modules/.cache/twoslash`.
- The site's components are vanilla shadcn in `shared/ui` (`@shared/ui`), installed by its CLI: don't edit them, reinstall (`pnpm dlx shadcn@4.21.4 add <name> --overwrite` in `shared/ui`). Brand colors live only in its `src/styles/globals.css` ([`decisions/shadcn-lib-and-branding.md`](./.agent-docs/decisions/shadcn-lib-and-branding.md)).
- The site is set up for Vercel, deployed from `v12` and never from `main` ([`decisions/docs-website-on-vercel.md`](./.agent-docs/decisions/docs-website-on-vercel.md)). It renders `www/`, the docs included, and its workspace dependencies: if it starts reading another path, add that path to `inputs` in `tooling/vercel-ignore/src/bin/ignore.ts`, or deployments skip changes to it.

## Tests

- No `beforeEach`/`afterEach` (`vitest/no-hooks`). Clean up with `using`/`await using`: a helper returns a `Disposable` that undoes its setup, for example `using _db = freshDb();` from `packages/trpc/src/fixtures/posts.ts`.
- `vite.config.ts` sets `unstubGlobals: true` and `restoreMocks: true`; don't restore stubs or mocks by hand.
- No `vi.mock` (`trpc/no-mock`) and no custom timeouts (`trpc/no-custom-test-timeout`). Make a slow test fast instead.
- `vitest/expect-expect`, `no-conditional-expect` and `no-standalone-expect` are off on purpose; the reasons are beside them in `vite.config.ts`.

## Lint and style

Custom rules are in `tooling/oxlint-plugin/` (see its `AGENTS.md`). Never write `eslint-disable` comments: fix the code, or scope the rule with an override in `vite.config.ts` and a comment saying why.

Folders under `packages/trpc/src/server/`, `serializer/`, `interop/`, `client/` and `openapi/` are modules ([`decisions/folder-modules.md`](./.agent-docs/decisions/folder-modules.md)): import another module through its `index.ts`, and a module's own files directly (`trpc/module-boundaries`). Import cycles fail lint (`import/no-cycle`). `import type` edges don't count, since they're erased; break a runtime cycle by moving the shared code into a module both sides import.

Effect code follows the `anti-slop-effect` rules. Build tagged values with `Data.taggedEnum` or tagged classes, not `{ _tag: … }` literals. Test them with `Predicate.isTagged`, `Option.isSome`/`isNone` or `Result.isFailure`, not by comparing `_tag`; recover with `Effect.catchReason`, not by branching on `err.reason._tag`. Use `Match` or a `Record` lookup instead of chained literal ternaries. In tests, assert with `expect(x).toSatisfy(Predicate.isTagged('X'))` or `toBeInstanceOf`, not `toMatchObject({ _tag })`.

Destructuring (`trpc/no-overzealous-destructuring`, also checked in `www/docs/` code blocks by `pnpm lint:docs`): take one parameter and read its members, named `opts` by default, `args` where `opts` would shadow, and `props` for components. Destructure only keys read three or more times. Name a call's result instead of destructuring it (`const serialized = serializeDeferred(…)`). After a bulk codemod, compare `eslint/no-shadow` counts before and after, and check that renamed locals don't collide with existing functions.

## Vendored Source

Source for this project's key dependencies is vendored under `.repos/`, pinned to the installed versions. When a question is about how one of these libraries actually behaves, read its vendored source — implementation, tests, examples — instead of relying on docs, memory, or web search. The trees are read-only reference material; see `.repos/AGENTS.md` before touching or citing them.

### Vendored packages

- `effect` (ref `effect@4.0.2`) → `.repos/effect`

Only Effect is vendored ([`decisions/vendored-sources.md`](./.agent-docs/decisions/vendored-sources.md)).

Managed by [vendor-src](https://www.npmjs.com/package/vendor-src), a devDependency of this workspace. Its config has to live at the repo root (`../vendor-src.json`, `"dir": "next/.repos"`), because vendor-src looks for the nearest directory with both `.git` and `package.json`. `rootAgentsMd` is off, so keep the list above in sync by hand when adding or bumping a vendored repo.

Every repo ignores `.repos/**`, so a vendored repo's own vendored sources stay out of the tree. `ignore` paths are pruned on `add` and `sync`; after adding one to a repo you don't want to sync, delete the matching paths by hand.

Every repo is git-only (`"packages": []`): vendor-src resolves installed packages from the repo root, which has no dependencies (`v11/` and `next/` are separate workspaces), so it can't tie a checkout to this workspace's lockfile. `vendor-src check` (run by `pnpm install`) skips git-only repos. `pnpm vendor:sync [name…]` moves each to its newest upstream ref: a tag to the highest tag with the same prefix (`effect@4.0.2` follows `effect@*`; prereleases only from a prerelease), a SHA to the default branch's `HEAD`.

So sync `effect` only when bumping its installed version to the same release (`pnpm vendor:sync effect`). `vendor-src add` needs a clean working tree and creates `git subtree` merge commits. Sync needs only the checkouts it touches to be clean, and commits the new tree and the pruned `ignore` paths itself. Then commit `../vendor-src.json` (`.repos/AGENTS.md` is rewritten for you) and update the list above by hand.
