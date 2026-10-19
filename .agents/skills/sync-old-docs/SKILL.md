---
name: sync-old-docs
description: Recopy trpc.io's v11, v10 and v9 docs, its blog and the home page's v11 steps from v11/www/ into next/www, then make the v11 docs' Twoslash blocks compile again. Nothing reruns it automatically. Use after merging `main` into `v12`, when v11/www/ docs or blog changed, when the human asks to sync, recopy or update the old docs, or when `old-docs:check` fails.
---

# Sync the old docs

`next/www/{v11,v10,v9}/`, `next/www/v11/home/`, `next/www/blog/`, `next/www/public/{v11,v10,v9}/`, `next/www/old-docs.json` and `next/www/trpc-io-redirects.json` are generated from `v11/www/` (trpc.io's Docusaurus site) by `next/www/build/old-docs-copy.ts`. No hook or CI job reruns or checks it: the copies only change when someone follows these steps. What the copy does and why is in [`next/.agent-docs/decisions/old-docs-copy.md`](../../../next/.agent-docs/decisions/old-docs-copy.md).

Work from `next/`, with `nvm use` first. Don't edit the generated files by hand: change the conversion (`www/build/old-docs-convert.ts`, with a test in `old-docs-convert.test.ts`) or the copy's lists in `old-docs-copy.ts`, and copy again.

## 1. Bring in the source

The copy reads `v11/www/` as checked out, so bring `main` in first ([`v11-folder.md`](../../../next/.agent-docs/decisions/v11-folder.md) says how and when; `main` keeps v11 at the repo root, and rename detection maps it onto `v11/`). It also reads v10's and v9's last releases, to pin their links to the repo, so fetch those tags:

```sh
git fetch --depth=1 origin tag v10.45.4 tag v9.27.4
```

## 2. Copy

```sh
pnpm --filter @trpc12/www old-docs:copy
```

It writes nothing when it fails, and says why:

- **A file it doesn't know** (a new doc no sidebar lists, a post in a folder, an image beside a doc): copy it, or add it to `notCopied` in `old-docs-copy.ts` with why.
- **A construct it can't convert** (a new MDX component, an unknown admonition): teach `old-docs-convert.ts` to convert it, with a test.
- **A link to nowhere:** a page that moved goes in `movedLinks`, with its new address or a Web Archive snapshot.

## 3. Compile the v11 Twoslash blocks

The v11 docs keep trpc.io's Twoslash blocks; the site compiles them in `www/samples/v11`, against tRPC v11 from npm. They need the `@trpc/*` the docs were written for, which is `main`'s, not the latest release:

1. Find the canary built from `main` at or after the merged commit: `pnpm view @trpc/server dist-tags.canary` (and `pnpm view @trpc/server versions --json` for older ones). A canary's version ends with its commit, as in `11.21.1-canary.20.10e2ef98f`; check it's on `main` after the merge base with `git merge-base --is-ancestor $(git merge-base HEAD origin/main) <commit>`.
2. Set every `@trpc/*` in `www/samples/v11/package.json` to that version (exactly, no range).
3. Add whatever new blocks import (a validator, an adapter, its `@types/*`), pinned, then `pnpm install`.

Then build the site, which compiles every block and fails on an error a block doesn't declare:

```sh
pnpm docs:build
```

For a failing block, fix the cause rather than the copy: a missing package or a wrong version goes in `samples/v11`; a Twoslash feature the site's renderer (`www/build/markdown.ts`) handles differently from trpc.io's goes in the conversion or the renderer, with a test. `pnpm --filter @samples/v11 typecheck` checks the app alone.

## 4. Check and commit

```sh
pnpm --filter @trpc12/www old-docs:check
pnpm vp test run www/
pnpm check
pnpm typecheck
```

`old-docs:check` copies into a scratch dir and fails when the committed copies differ from it. Commit the copies with what changed to make them (`samples/v11`, the lockfile, the conversion), as `docs(www): recopy the old docs from main`, or one commit per logical change when the conversion changed too.
