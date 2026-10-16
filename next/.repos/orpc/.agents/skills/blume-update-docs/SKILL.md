---
name: blume-update-docs
description: Keep a Blume docs site in sync with the product it documents. Audit recently merged pull requests, changelogs, config schemas, CLI help, and public APIs against the docs content, update only pages that are factually stale, verify the docs build, and open (or update) a maintenance pull request — or report a clean no-op. Use when asked to check docs for drift, refresh stale documentation, run a scheduled docs audit, or keep docs current after a release.
---

# Update Blume Docs

Blume is a **markdown-first** documentation framework on Astro/Vite: content lives as Markdown/MDX under a content root (default `docs/`), navigation derives from the file tree plus optional `meta.ts` files, `blume build` validates frontmatter and duplicate routes, and `blume validate` checks links and anchors.

Your job is **docs maintenance, not docs authorship**: find where shipped, user-facing behavior has drifted from what the docs claim, fix exactly that, prove the site still builds, and deliver the result as a pull request. A run that finds nothing actionable ends with a short report and **no branch, no commit, no PR** — prefer a no-op over a noisy PR.

## Ground rules

- **Only document what shipped.** Never invent features, timelines, pricing, APIs, or compatibility claims. Work behind a feature flag is not ready for docs unless the flag is enabled for the documented audience or the repo explicitly documents unreleased behavior.
- **Facts over polish.** Edit when a command, option, default, route, prop, or workflow is wrong or missing. Skip subjective rewording, marketing polish, restructuring, and formatting-only churn.
- **Smallest correct diff.** Touch the fewest pages that remove the drift. Preserve the site's voice, frontmatter style, component usage, and `meta.ts` navigation patterns.
- **Exact source-of-truth wording** for commands, flags, config keys, environment variables, routes, and version numbers — copy them from code, don't paraphrase from memory.
- **Respect the repo.** Follow `AGENTS.md`/`CLAUDE.md` conventions, don't touch generated output (`.blume/`, `dist/`), and never overwrite unrelated local changes.

## Workflow

1. **Establish context.**
   - Read the repo's agent/contributor instructions (`AGENTS.md`, `CLAUDE.md`, contribution docs) and honor them.
   - Locate the docs app and content root: `blume.config.ts` (`content.root`), the directory of `.md`/`.mdx` pages, `meta.ts` files, and the package manager + docs build command.
   - If this run was configured with a trigger, lookback window, docs path, target branch, or PR policy, honor those. Use the defaults below only where the prompt is silent.

2. **Reuse or create a maintenance branch.**
   - If an open docs-maintenance PR from a previous run exists (head branch starting with `blume/`), check out and update that branch instead of opening a duplicate.
   - Otherwise branch from the default branch as `blume/docs-refresh-YYYY-MM-DD`. Create the branch only once you know an edit is needed.

3. **Find drift.** Read `references/audit-checklist.md` for the full source list and change criteria, then:
   - Review PRs merged into the default branch within the lookback window (default: the last 7 days) and extract the user-facing changes.
   - Compare those changes — plus changelogs, release notes, config schemas, exported APIs, CLI help, and examples — against the docs content.
   - Check external links only when a checked page depends on them; prefer official docs and release notes over secondary sources.
   - Keep notes: what you checked, what changed upstream, and why each edit is (or isn't) needed.

4. **Update the docs.**
   - Fix the stale pages. Add, rename, or remove `meta.ts` entries when pages are added, renamed, or deleted.
   - Match the surrounding pages: frontmatter shape, Blume components already in use, code-fence style, root-relative internal links.

5. **Verify.**
   - Run the docs build (`blume build` or the repo's documented docs QA) — it validates frontmatter and duplicate routes.
   - Run `blume validate` to check internal links and anchors.
   - Run lint/format/typecheck when the repo's conventions call for them on docs changes.
   - Fix failures your edits caused; report pre-existing failures separately instead of fixing them in this PR.

6. **Deliver.**
   - **Changes made:** commit only the maintenance edits, push the `blume/*` branch, and open or update a PR against the default branch titled like `blume: refresh docs for YYYY-MM-DD`. In the body list sources checked, docs changed, verification commands and results, skipped checks, and residual risk.
   - **No changes needed:** report the PRs and docs areas checked and the no-op result. Do not create a branch, commit, or PR.

## Resources

- `references/audit-checklist.md` — the source checklist, edit/skip criteria, and Blume-specific editing guidance. Read it before making docs changes.
