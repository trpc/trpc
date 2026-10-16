# Documentation

- Register new published pages in `router/config.json` or `start/config.json`; drafts need not be registered.
- Run `pnpm test:docs` from the repository root for Markdown link validation. It checks `docs/**/*.md`, not Markdown elsewhere. Relative links resolve from the containing file.
