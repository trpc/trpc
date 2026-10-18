# No git tags or GitHub Releases on the 0.x preview line (human)

- Human, 2026-10-17: "also keep track that whilst on `0.0.x` we don't wanna do tags on github even when releasing". Clarified: the whole preview line (`0.x`, every `@trpc12/*` version before `12.0.0`), not a literal return to `0.0.x`. The first release is already `0.1.0` ([`npm-names.md`](./npm-names.md)).
- Releases on the preview line create **no git tags** and **no GitHub Releases** on trpc/trpc.
- Why: keeps trpc/trpc's tag list and Releases page for v11 while the preview churns.
- Lost: per-version git refs and GitHub release notes for the preview. Changelogs, if any, live elsewhere.
- (agent) Releases use Changesets ([`versioning.md`](./versioning.md)): `privatePackages.tag: false` in `.changeset/config.json`, and publishing runs `changeset publish --no-git-tag`, with no `gh release create`. This stops applying at `12.0.0`. The v11 `release.yml` on `main` keeps tagging `v11.x.y`.
- Open: there's no release workflow yet ([`versioning.md`](./versioning.md)).
- Lives in: `next/.changeset/config.json`; the future vNext release workflow.
