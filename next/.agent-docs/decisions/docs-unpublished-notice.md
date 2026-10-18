# The docs site says v12 isn't on npm yet, and warns when an install is copied (human asked)

- Human, 2026-10-18: "This is not published on npm yet so maybe highlight that... As a banner and some sort of cool warning if you wanna copy any installation strings".
- (agent) A strip above the header says the `@trpc12/*` packages can't be installed until v12 is released and links the v11 docs. It shows on every page but the v11 docs, whose packages are on npm.
- (agent) A `package-install` block that installs a `@trpc12/` package carries a "Not on npm yet" badge in its tab bar, added when the markdown renders; the home page's install line has the same badge.
- (agent) Copying a command that names a `@trpc12/` package, with a block's Copy button or by selecting and copying text, still copies it, and shows a toast: the command, the 404 it would get, and buttons to use v11 or dismiss. Another copy replaces the toast rather than stacking one; the block's badge shakes, unless the reader prefers reduced motion.
- Why: every install command on the site fails today, and a reader finds out from their package manager unless the site says so where they copy it.
- Lost: nothing to remove later but the strip, the badge and the toast; when v12 is published, delete `unpublished.tsx`, the badge in `rehypeCodeTabs` and this file.
- Lives in: `next/www/src/components/unpublished.tsx`, `next/www/src/components/doc-body.tsx` (`copyCode`), `next/www/src/routes/__root.tsx`, `next/www/src/routes/index.tsx`, `next/www/build/markdown.ts` (`remarkPackageInstall`, `rehypeCodeTabs`), `next/www/src/styles.css` (`.code-unpublished`).
