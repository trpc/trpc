# Conventional PR titles enforced in CI (agent)

- CONTRIBUTING already required conventional PR titles (squash-merge subject → release-it changelog / bump). CI now fails non-matching titles via `.github/workflows/pr-title.yaml` → `@tooling/pr-title` (parent agent, 2026-10-14).
- Allowed types match `.release-it.json` (`feat`, `fix`, `perf`, `build`, `chore`, `ci`, `docs`, `refactor`, `style`, `test`); a unit test keeps the lists equal. Breaking changes use `type!:` / `type(scope)!:`.
