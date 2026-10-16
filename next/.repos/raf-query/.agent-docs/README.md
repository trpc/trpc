# Agent docs

Working memory for coding agents on this repo. **Agents own this folder** — create, edit, and delete freely. Prefer durable facts over chat transcript fluff.

| Doc                                                  | What belongs here                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [decisions/](./decisions/)                           | Choices (human or agent) that later work should not quietly reverse, one per file     |
| [origin.md](./origin.md)                             | What the name means and the tooling baseline                                          |
| [implementation-notes.md](./implementation-notes.md) | Verified mechanisms to copy from TanStack / React source, and which package owns what |
| [bundle-size.md](./bundle-size.md)                   | Bundle size numbers against TanStack Query, and what defeats tree-shaking             |

## Rules of thumb

- Put **product intent and public API** in the docs site's pages, `www/content` (human-facing, “how it works now”). The root and package READMEs only link there; see [decisions/docs-split.md](./decisions/docs-split.md).
- Put **why we did X / don’t do Y** here so future sessions don’t re-litigate or re-discover.
- When a decision is superseded, update or delete it — don’t accumulate archaeology.
- Don’t duplicate `.github/DEVELOPMENT.md` (how to build/test) or `AGENTS.md` (session boot instructions).

## Decisions

Many PRs are open at once, so each decision is its own file and PRs rarely touch the same one:

- **A new decision is a new file**: `decisions/<topic>.md`, kebab-case, named by topic. No dates or sequence numbers in the name (parallel PRs would pick the same number), and no index file (every PR would edit it). Changing a decision edits its file; reversing one deletes or rewrites it.
- Each file starts with `# Title (who)`, then short bullets: what was decided, the reason, what lost, and the files it lives in. The PR's "Alternatives considered" section has the longer case against what lost. `(human …)` marks what the human decided or asked for: don't reverse it without asking. `(agent)` is open to revision with a good reason.
- Find decisions with `head -n 1 .agent-docs/decisions/*.md` for the titles, or `rg <term> .agent-docs/decisions`.

## Digging deeper with git

The files keep the short version. The full reasoning lives in git: the diff that made the decision, its commit message, and the PR description and review thread behind it. Use them before reversing something or when a file doesn't say why.

- `git blame -C -C .agent-docs/decisions/<topic>.md`, then `git show <sha>`. `-C -C` follows lines moved between files, so lines older than their file still point at the commit that wrote them. Squash merges end in `(#N)`; `gh pr view N --comments` has the PR's description and discussion.
- `git log -p -- .agent-docs/decisions/<topic>.md`: every change to the file since it was created.
- `git log -S '<distinctive phrase>' --oneline -- .agent-docs` finds the commit that added a line wherever it lived. Run without `-- .agent-docs` to find the code change too.
- For the code a decision names, `git blame -L <start>,<end> <file>` and `git log -L <start>,<end>:<file>` lead to the PR that introduced it.
