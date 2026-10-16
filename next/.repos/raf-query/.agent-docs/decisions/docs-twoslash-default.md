# Docs `ts`/`tsx` examples use Twoslash (human asked)

- **Every `ts` / `tsx` block in `www/content` compiles with Twoslash** (human): a `sample` fence or an inline `twoslash` fence (see [docs-sample-fences.md](./docs-sample-fences.md)). Same Shiki highlighting as before, plus type-on-hover like the homepage. Bash, CSS, demos, and language-less diagrams stay plain.
- **Hidden setup** (agent): in a sample file, the lines outside the block's region (and a wrapping function when a fragment has a top-level `return`); in an inline block, the imports above `// ---cut---`. A directive (`"use client"`) is the first line of its file, in a region part of its own: below imports it's a plain string, which the formatter wraps as `("use client");`.
- **Popups show the type only** (human): `rendererRich({ jsdoc: false })`; JSDoc made them huge.
- **Verify with the Vite build** (agent): `pnpm --filter @raf-query/www build` compiles every page; a workspace-root Node check can miss `www/` resolution. Lost: leaving fragments as Shiki-only.
