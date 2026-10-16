## Environment

- Node is pinned in `.nvmrc`. The default shell Node may be older; switch first with `eval "$(fnm env)" && fnm use`.
- If `pnpm` fails with `Cannot find module .../corepack/v1/pnpm/<version>/bin/pnpm.cjs`, the installed corepack can't launch the pnpm version in `packageManager`. Upgrade corepack (`npm i -g corepack@latest`) or call the cached binary directly: `~/.cache/node/corepack/v1/pnpm/<version>/pnpm`.

## Verifying changes

- Test programmatically: unit tests, type checks, builds, `curl` against a dev server or a preview. See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).
- For changes to an example app or to behavior the example apps show, drive the apps with the [`verify-examples`](.agents/skills/verify-examples/SKILL.md) skill, and update its feature map in the same PR when something a user sees changes.
- Only use computer use (driving a browser on the VM) for things that need taste: how a UI looks or feels to use. Don't use it to check behavior that a test or a request can check.
- Don't record video demos or screen recordings. They are slow and cost a lot of tokens. Instead, fill the Links table in [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md): deep-link the Vercel previews of the docs page and the example route this change shows (exact page or route, with an anchor when it helps — not just the site root).
- **Never invent or guess a preview hostname.** Copy the base URL from the Vercel bot's PR comment after that project's deployment is Ready (`Preview` column). Projects: `www` → `raf-query`, `examples/nextjs` → `raf-query-nextjs`, `examples/tanstack-start` → `raf-query-tanstack-start`, `examples/react-router` → `raf-query-react-router`, `examples/tanstack-start-effect` → `raf-query-tanstack-start-effect`. Hostnames include a team suffix (today `-trpc.vercel.app`) and long branch names can be truncated — guessing `-katt`, production, or a hand-built slug will 404. If the deploy isn't Ready yet, omit the links (or say "pending") and add them in a follow-up edit once the bot posts Ready URLs.

## Code

- Write all the logic you can in Effect: libraries, build steps, CI and deploy scripts, tooling. Files, processes, HTTP and env go through Effect's services (`FileSystem`, `Path`, `ChildProcessSpawner`, `HttpClient`, `Config`), provided by `NodeServices.layer` at the edge, not `node:fs` / `node:child_process` / `process.env`. Plain code only where Effect can't run, such as a sync React render path. Read `.repos/effect` (start with `LLMS.md`) for the idioms. See [`.agent-docs/decisions/effect-everywhere.md`](.agent-docs/decisions/effect-everywhere.md).

## Commits and pull requests

- Open PRs ready for review, not as drafts. Use a draft only for experiments and prototypes that aren't meant to merge as they are.
- Commit early and often: one commit per step that works, not one at the end.
- Split a big body of work into stacked PRs instead of finishing it all first. Open each PR as soon as its piece stands on its own, with the previous PR's branch as its base, so review starts while you build the next piece. Say in each PR description where it sits in the stack and link the other PRs.
- PRs merge with a squash, so when one lower in the stack merges, rebase the next branch onto `main` and point its PR's base at `main`.

## Documentation

- The docs site's pages (`www/content`) are the full documentation, API reference included. The root `README.md` and each package's `README.md` are a short taste that links there: don't copy guides or reference tables into them.
- The docs and READMEs describe how raf-query works **now**. Don't reference history: no "since vX", "as of vX", "previously", "no longer", "pre-X.Y.Z", or migration notes. Version history and upgrade notes belong in `CHANGELOG.md` (generated from commit messages on release), so put that context in the commit / PR description instead.
- When the docs name a third-party API, option, or concept (React Router's `clientLoader`, Next.js's `headers()`, a TanStack Router option, a web platform API), link its official documentation at its first mention on the page. Check that each link and anchor resolves.
- [`.agent-docs/`](.agent-docs/) is agent-owned working memory (decisions, bootstrap context, notes worth keeping across sessions). Read it when starting non-trivial work; update it when you learn or decide something durable. Edit and delete at will — see [`.agent-docs/README.md`](.agent-docs/README.md).
- Decisions are one file each in `.agent-docs/decisions/`: add a new file rather than appending to an existing one. They hold the short version. For the full reasoning, use git history (`git blame -C -C` on the file, then `gh pr view N --comments` for the `(#N)` in the commit subject), as described in `.agent-docs/README.md`.

<!-- vendor-src:start -->

## Vendored Source

Source for this project's key dependencies is vendored under `.repos/`, pinned to the installed versions. When a question is about how one of these libraries actually behaves, read its vendored source — implementation, tests, examples — instead of relying on docs, memory, or web search. The trees are read-only reference material; see `.repos/AGENTS.md` before touching or citing them.

### Vendored packages

- `@tanstack/react-query@5.104.1` → `.repos/query`
- `@tanstack/react-router@1.170.42` → `.repos/router`
- `effect@4.0.1` → `.repos/effect`

<!-- vendor-src:end -->
