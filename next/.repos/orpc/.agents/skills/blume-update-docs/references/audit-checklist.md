# Audit checklist

Use this checklist to decide whether a docs-maintenance run should make changes.

## Sources to check

- **Repo instructions:** `AGENTS.md`, `CLAUDE.md`, contribution docs, release docs, PR templates, and package scripts.
- **Blume config:** `blume.config.ts` — `content.root`, navigation (`meta.ts` files, tabs, selectors), site settings, AI/MCP settings, search, OpenAPI/AsyncAPI sources, theme, and export settings.
- **Public surface area:** exported package entrypoints, config schemas, component props, CLI commands and help text, route handlers, environment variables, and registry items.
- **User workflows:** quickstarts, examples, migration guides, deployment guides, screenshots, sample projects, and README snippets.
- **Recent merge signals:** PRs merged within the lookback window (default 7 days), changelogs, release notes, changesets, tags, and package version bumps.
- **Docs content:** every `.md`/`.mdx` page under the configured content root, plus custom pages and blog/changelog entries.
- **External dependencies:** official provider docs and release notes for linked integrations — only when the docs mention them or the dependency changed.
- **Generated docs surfaces:** `llms.txt`, raw Markdown URLs, MCP tools, OpenAPI pages, search, sitemap, robots, RSS, and OG behavior when relevant.

## Change criteria

Make a docs edit when at least one condition is true:

- A command, config option, environment variable, route, CLI flag, component prop, or default value changed.
- A documented workflow no longer works or misses a required step.
- A page promises a feature, provider, adapter, or integration the code no longer supports.
- A new user-facing capability shipped but is absent from the appropriate docs page.
- A link points at moved, removed, or outdated primary documentation.
- A changelog or release page needs an entry for shipped user-facing behavior.

Skip the edit when the only available change is subjective polish, wording preference, duplicated information, speculative future work, or behavior still hidden behind a feature flag.

## Blume editing guidance

- Keep frontmatter short and factual; use `title` and `description` consistently with nearby pages. Blume's frontmatter schema is **strict** — unknown keys are build errors.
- Preserve existing page order and `defineMeta` style; update `pages` arrays when adding, renaming, or removing pages.
- Use the Blume components already present in the docs (callout directives, steps, cards) instead of inventing new markup patterns.
- Match nearby code fences: filenames, language tags, and line numbers where the surrounding docs use them.
- Keep internal links root-relative (`/guides/setup`), in the form nearby pages already use.
- Do not edit generated `.blume/` or `dist/` output.

## PR notes

Include these sections in the PR body or no-op summary:

- Sources checked
- Docs changed
- Verification run (commands and results)
- Skipped checks, with reasons
- Remaining risk or follow-up
