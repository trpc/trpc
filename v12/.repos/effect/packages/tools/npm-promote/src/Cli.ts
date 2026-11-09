import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Config from "effect/Config"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Semver from "semver"
import type { ReleasePackage } from "./NpmPromote.ts"
import { NpmPromoteError } from "./NpmPromoteError.ts"
import { Alerts, layerDryRun, promoteRelease, Website } from "./Release.ts"
import * as Workspace from "./Workspace.ts"

const dryRun = Flag.Boolean("dry-run").pipe(
  Flag.withDescription("Print what would change without moving dist-tags, deploying, or touching GitHub issues"),
  Flag.withDefault(false)
)

const overdueAfterHours = Flag.Int("overdue-after-hours").pipe(
  Flag.withDescription("Open a tracking issue when a version bump is still unpromoted after this many hours"),
  Flag.withDefault(12)
)

const githubConfig = Config.all({
  github: Config.all({
    repository: Config.String("GITHUB_REPOSITORY"),
    token: Config.Redacted("GITHUB_TOKEN")
  }),
  dispatchToken: Config.Redacted("WEBSITE_DISPATCH_TOKEN")
})

const format = (pkg: ReleasePackage) => `${pkg.name}@${pkg.version}`

const run = Effect.fnUntraced(function*(options: {
  readonly dryRun: boolean
  readonly overdueAfterHours: number
}) {
  const workspace = yield* Workspace.releasePackages(process.cwd())
  const effect = workspace.find((pkg) => pkg.name === "effect")
  if (effect === undefined) {
    return yield* new NpmPromoteError({ message: "The workspace has no public effect package" })
  }

  // Never point latest at a prerelease. Pre mode releases keep their own dist-tag.
  const prereleases = workspace.filter((pkg) => Semver.prerelease(pkg.version) !== null)
  if (prereleases.length > 0) {
    yield* Console.log(`Skipping promotion of prerelease versions: ${prereleases.map(format).join(", ")}`)
    return
  }

  const bump = yield* Workspace.versionBump(effect.directory)
  if (Option.isNone(bump)) {
    return yield* new NpmPromoteError({ message: "Could not find the commit that bumped the effect version" })
  }

  // Real runs need GitHub to record deploys and track overdue releases, so missing configuration fails up front.
  const services = options.dryRun ? layerDryRun : yield* githubConfig.pipe(
    Effect.map(({ dispatchToken, github }) =>
      Layer.mergeAll(Website.layerGitHub(github, dispatchToken), Alerts.layerGitHub(github))
    ),
    Effect.mapError((cause) =>
      new NpmPromoteError({
        message: "GITHUB_REPOSITORY, GITHUB_TOKEN and WEBSITE_DISPATCH_TOKEN are required unless --dry-run is set",
        cause
      })
    )
  )

  yield* promoteRelease({
    packages: workspace.map(({ name, version }): ReleasePackage => ({ name, version })),
    bump: bump.value
  }, options).pipe(Effect.provide(services))
})

export const cli = Command.make("npm-promote", { dryRun, overdueAfterHours }).pipe(
  Command.withDescription("Move the latest dist-tag to the staged release once every package is visible on npm"),
  Command.withHandler(run)
)
