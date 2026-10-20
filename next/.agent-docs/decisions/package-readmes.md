# Every package has a README, a description and a docs page (human asked)

- Human, 2026-10-18: "Make sure every package has good structured docs and that navigation is simple enough to go through".
- (agent) Each package in `packages/` has a `README.md`: its name as the title, what it is, `pnpm add`, a short example and a "Docs" list. npm shows the README, so its links point at the pages on the site (`https://v12.trpc.io/v12/docs/…`, `site.url` and `v12.basePath` from `www/src/site.ts`), not relative paths or files on GitHub.
- (agent) Each `package.json` has a `description`, and each package is a row of `docs/packages.md`, which links its docs page; the `@trpc12/trpc` entry points have a table there too.
- (agent) Each package's docs page, and each library recipe (AI SDK, Better Auth), opens with an install block of the packages it uses.
- (agent) `tooling/pack/docs.test.ts` checks the description, the README's title, that it links at least one docs page, on the site, and that every linked page exists, and that `docs/packages.md` names the package.
- Why: the site covered the core well, but a package found on npm or in `packages/` had no page saying what it is or where its docs are.
- Lost: READMEs repeat a little of the docs; a moved page breaks a README link (the test catches it).
- Lives in: `next/packages/*/README.md`, `next/packages/*/package.json`, `next/docs/packages.md`, `next/tooling/pack/docs.test.ts`.
