# No tests of the docs site's UI (human asked)

Human, after `starting-queries.test.tsx` failed CI on a docs-only PR: "looks like it failed by some dumb test that should be deleted … do a sweep and fix/delete other tests like it".

- Applies [testing.md](./testing.md)'s "don't unit test the docs site's presentation". Deleted: the starting-queries demo's Testing Library test (timing-dependent: it read the page between a click and the fake server's response), the homepage framework-mode tests (URL `mode` parsing, the before-paint script) and the framework pill's layout math. Lost: a check that the demo's three verbs keep their request order, and that `?mode=` picks the right homepage tab; a look at the preview covers both.
- `www`'s tests are the build's (`www/build/*.test.ts`: sample expansion, code folding), which run in Node with no DOM. `www` no longer depends on Testing Library or happy-dom.
- Behavior a demo shows belongs in `packages/*` tests, against the library.
