---
name: merge-main
description: Merge `main` (tRPC v11) into the `v12` branch with one merge commit, and check each change it brings for a counterpart in `v12/`. Use when asked to merge, sync or bring `main` into `v12`, or to pick up v11 fixes on `v12`.
---

# Merge `main` into `v12`

`main` is v11. On `v12`, v11 lives in `v11/` and the rewrite in `v12/`, so a sync is one merge commit of `origin/main` whose changes rename detection lands in `v11/`. It's the only merge commit `v12` takes ([`v12/AGENTS.md`](../../../v12/AGENTS.md#landing-on-v12)). How each kind of file resolves, and what earlier syncs ran into, is in [`v11-folder.md`](../../../v12/.agent-docs/decisions/v11-folder.md). Read it before you start; this skill doesn't repeat it.

`main` doesn't port its changes to `v12`: this merge is how they arrive, so it's also where you decide which of them `v12/` needs.

## 1. Read what's coming

Work in a fresh worktree off `origin/v12`. Don't `git stash`: worktrees share one stash.

```sh
git fetch origin main v12
base=$(git merge-base origin/v12 origin/main)
git log --first-parent --format='%h %s' "$base"..origin/main
```

Sort every commit before you merge:

- **v11's packages, examples and scripts:** land in `v11/` by rename.
- **Shared at the root** (`www/`, `tooling/ui/`, `tooling/subtree/`, the workspace files): merge in place. Check `v12`'s side of them still works.
- **Workflows, and root files `v12` owns:** go to the `v11-*` copies by hand, as `v11-folder.md` lists.
- **A fix or feature in a v11 package:** decide whether `v12/` needs it too. Find the counterpart in `v12/packages/` (search for the symbol, adapter or behaviour) and read its tests.
  - Same bug or gap: fix it in `v12/` after the merge, in its own commit with a test, as `v12/AGENTS.md` says.
  - Not there (rewritten, removed or already right): note why in one line.
  - Security fixes (`main`'s advisories, and `Merge commit from fork` commits) always get this check.

Keep the list: it becomes the merge commit's body.

## 2. Merge

```sh
git -c rerere.enabled=true -c merge.renameLimit=100000 -c merge.directoryRenames=true \
  merge --no-ff --no-commit origin/main
```

Resolve each conflict with `v11-folder.md`'s rules. For `pnpm-lock.yaml`, take `v12`'s, run `pnpm install`, and rebuild it as `v11-folder.md` says if peers drift far from the merge.

Once everything is staged, check that every path `main` changed is `main`'s file at `v11/<path>`:

```sh
git diff --name-only --no-renames "$base" origin/main -- examples packages scripts |
  while read -r p; do
    [ "$(git rev-parse -q --verify "origin/main:$p")" = "$(git rev-parse -q --verify ":v11/$p")" ] ||
      echo "differs: $p"
  done
```

A path can differ on purpose, such as `v12`'s own change to v11 or a relative path that needs one more `../`. Say so in the commit. Then record the resolutions, so a redo replays them: `git -c rerere.enabled=true rerere`.

## 3. Gates

Run the root's `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm check:www`. A failure that comes from `main`'s change meeting `v12`'s own belongs in the merge commit: fix it there.

## 4. Commit and push

Follow the earlier syncs (`git log --merges origin/v12`):

```text
chore: merge main into v12

Brings in trpc/trpc#…, with main's other commits since the last sync.

- <each resolution that wasn't mechanical>
- v12/: <what gets ported, in the next commit> / <what isn't needed, and why>
```

Push with a plain `git push origin HEAD:v12`, not `pnpm land`, which would rebase the merge flat. If `v12` moved meanwhile, don't rebase the merge or merge `v12` into it. Reset to `origin/v12` and run step 2's merge again: rerere replays your resolutions; check and stage them.

## 5. Afterwards

- Land each `v12/` fix from step 1 with `pnpm land` in `v12/`, as usual.
- A new kind of conflict or resolution gets one bullet in `v11-folder.md`, so the next sync knows it.
