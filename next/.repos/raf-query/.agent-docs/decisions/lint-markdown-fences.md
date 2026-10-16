# Lint rules reach Markdown fences through their tests (agent)

- Oxlint doesn't read Markdown. A rule that should hold in Markdown too adds `tester.run("<rule> in Markdown fences", rule, { valid: markdownFences(), invalid: [] })` to its test, so `pnpm test` fails on a violating fence, named `file:line`.
- `tooling/oxlint-plugins/markdown-fences.ts` returns every `js` / `jsx` / `ts` / `tsx` fence in git-tracked `.md` / `.mdx`, except `.repos/` and `CHANGELOG.md` (generated from commits). `sample` fences are skipped: their files in `www/samples` are linted as code.
- A fence that is only an object's members (a route's `loader: …,`) is linted inside `({ … })`. A fence that doesn't parse either way fails.
- Per-rule opt-in, not every rule: most rules (`no-unused-vars`, `no-undef`, React Compiler) fight fragments. Lost: a `lint:md` script running all of `.oxlintrc.json` over extracted fences; markdownlint (see [markdown-formatting.md](./markdown-formatting.md)).
