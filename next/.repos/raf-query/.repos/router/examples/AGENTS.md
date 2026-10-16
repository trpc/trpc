# Examples

- Versioned dependencies on this repository's packages resolve locally through `pnpm-workspace.yaml` overrides. Keep published version ranges in example manifests; do not replace them with `workspace:*` as a linking fix.
- Root `pnpm dev` watches package builds. To run an example app, use its own `dev` script after building its workspace dependencies.
