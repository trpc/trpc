# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

This will prompt you to select which packages are affected and the type of version bump (patch, minor, major). A markdown file will be created in this directory describing the change.

## For changes that don't need a release

If your PR doesn't affect published packages (e.g., docs, CI, tests), add an empty changeset:

```bash
pnpm changeset --empty
```

## How releases work

1. Changesets accumulate on `main` as PRs are merged
2. A "Version Packages" PR is automatically created/updated with all pending version bumps and changelog entries
3. Merging that PR triggers the actual npm publish
