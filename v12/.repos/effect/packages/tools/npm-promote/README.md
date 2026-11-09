# npm promote

`@effect/npm-promote` moves the `latest` dist-tag to a release that
`changeset publish` put under `staging`. It waits until npm's abbreviated
metadata lists the target version of every public workspace package, so fresh
installs never resolve an `@effect/*` version that needs an `effect` the
registry does not serve yet.

Preview what it would do from the repository root:

```sh
node packages/tools/npm-promote/src/bin.ts --dry-run
```

Each run:

1. Lists the non-private workspace packages and their versions at the
   checked-out revision.
2. Fetches each package's abbreviated metadata from `registry.npmjs.org`. If any
   target version is missing, nothing is promoted.
3. Runs `npm dist-tag add <name>@<version> latest`, `effect` first, for every
   package whose `latest` is lower than the target. The CDN caches the
   abbreviated metadata for minutes, so it only decides visibility; each
   package is decided from its live `latest` on the dist-tags endpoint. A
   higher `latest` is never moved back, so a run that failed halfway is
   finished by the next one. A failed read or write stops the run, so no
   package moves ahead of `effect`.
4. Deploys the website for the version bump commit when `effect`'s live
   `latest` is exactly the target and no deploy is recorded for that commit.
   Deploys are recorded as GitHub deployments in the `website-v4` environment,
   so a failed or interrupted deploy is retried by the next run.
5. Closes every open tracking issue. A release that a newer one superseded
   still closes them, and a failure to close never blocks the deploy.

When the version bump commit is older than `--overdue-after-hours` (12 by
default) and the release is still not visible or cannot be promoted, the tool
opens or updates a single tracking issue. For versions that are not visible it
checks each version's own registry document and lists versions missing from npm
(404), versions published but not visible yet, and versions whose check failed.
Failed `npm dist-tag add` writes are listed separately, and a registry read
that fails during promotion lists its version as unchecked. Read failures while
deciding the website deploy happen after promotion succeeded, so they fail the
run and are retried, but never open the tracking issue. Prerelease versions are
never promoted.

GitHub's issue listing can miss an open issue while GitHub is degraded, so a
run may open a duplicate tracking issue. The next run keeps the oldest open
tracking issue and closes the others as duplicates of it.

`--dry-run` reads the registry and prints the plan. It never moves dist-tags,
deploys the website, or touches GitHub issues. Real runs need
`GITHUB_REPOSITORY`, `GITHUB_TOKEN` and `WEBSITE_DISPATCH_TOKEN`.

## Workflow

`.github/workflows/npm-promote.yml` runs every 10 minutes and after each
`Release` run on `main`. Setting the `NPM_PROMOTE_PAUSED` repository variable
to `true` skips new runs, which keeps a bad release on `staging`.

The job moves dist-tags with npm trusted publishing over OIDC, so no npm token
is stored anywhere. It runs in the `npm-promote` environment with
`id-token: write` and npm 11.21.0 or later. `effect` and every `@effect/*`
package need two trusted publisher configurations:

- `release.yml`: publishing allowed, "Allow npm dist-tag" off.
- `npm-promote.yml` in environment `npm-promote`: publishing not allowed,
  "Allow npm dist-tag" on.

With no tokens involved, packages can also turn on "Require two-factor
authentication and disallow tokens".

## Other writers of `latest`

Only this workflow is expected to move `latest`. `changeset publish` uses the
`staging` tag; npm sets `latest` itself only on the first publish of a new
package, which leaves it at the target. npm has no compare-and-set for
dist-tags, so the live read narrows but cannot close the window between reading
and writing a tag.

To change `latest` by hand, set `NPM_PROMOTE_PAUSED=true`, then wait until no
`npm promote` run is in progress: pausing only skips runs that have not started.
Unpause once the manual change is done. To roll back a bad release, stay paused
until `main` has a fixed version: once unpaused, the tool moves `latest` back
to the version at HEAD.

## Website deploys

A deploy sends the `publish-api-reference` dispatch to Effect-TS/website. The
website builds an API reference snapshot keyed by the v3 and v4 revisions and
reuses it when that snapshot is already published, so a repeated dispatch for
the same revision only redeploys the site. A recorded deploy means the website
accepted the dispatch, not that its own deploy succeeded.
