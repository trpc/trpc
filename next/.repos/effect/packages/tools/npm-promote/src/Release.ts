import * as Clock from "effect/Clock"
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import type * as Redacted from "effect/Redacted"
import type { GitHubRepository } from "./GitHub.ts"
import {
  diagnosePending,
  type Diagnosis,
  liveLatest,
  type NpmCli,
  promote,
  type PromoteResult,
  type ReleasePackage
} from "./NpmPromote.ts"
import { NpmPromoteError } from "./NpmPromoteError.ts"
import * as TrackingIssue from "./TrackingIssue.ts"
import type { OverdueRelease } from "./TrackingIssue.ts"
import * as WebsiteDeploy from "./WebsiteDeploy.ts"
import type { VersionBump } from "./Workspace.ts"

/**
 * Website deployments, with a persisted record of which revisions were
 * deployed so a failed or interrupted deploy is retried by the next run.
 */
export class Website extends Context.Service<Website, {
  readonly isDeployed: (revision: string) => Effect.Effect<boolean, NpmPromoteError>
  /** Requests the deployment and records it once the request succeeded. */
  readonly deploy: (revision: string) => Effect.Effect<void, NpmPromoteError>
}>()("@effect/npm-promote/Website") {
  /**
   * Records deploys as GitHub deployments in `github.repository` and sends the
   * dispatch to Effect-TS/website with `dispatchToken`.
   */
  static readonly layerGitHub = (github: GitHubRepository, dispatchToken: Redacted.Redacted<string>) =>
    Layer.effect(
      Website,
      Effect.map(Effect.context<HttpClient.HttpClient>(), (context) =>
        Website.of({
          isDeployed: (revision) => Effect.provide(WebsiteDeploy.isDeployed(github, revision), context),
          deploy: (revision) => Effect.provide(WebsiteDeploy.deploy(github, dispatchToken, revision), context)
        }))
    )
}

/**
 * The single tracking issue for an overdue release.
 */
export class Alerts extends Context.Service<Alerts, {
  readonly open: (release: OverdueRelease) => Effect.Effect<void, NpmPromoteError>
  readonly resolve: Effect.Effect<void, NpmPromoteError>
}>()("@effect/npm-promote/Alerts") {
  static readonly layerGitHub = (github: GitHubRepository) =>
    Layer.effect(
      Alerts,
      Effect.map(Effect.context<HttpClient.HttpClient>(), (context) =>
        Alerts.of({
          open: (release) =>
            TrackingIssue.upsert(github, TrackingIssue.render(release)).pipe(
              Effect.flatMap((issue) => Console.log(`Tracking issue #${issue.number}: ${issue.action}`)),
              Effect.provide(context)
            ),
          resolve: TrackingIssue.close(github, "Promotion succeeded, so this is resolved.").pipe(
            Effect.flatMap(Effect.forEach((number) => Console.log(`Closed tracking issue #${number}`), {
              discard: true
            })),
            Effect.provide(context)
          )
        }))
    )
}

export interface Release {
  readonly packages: ReadonlyArray<ReleasePackage>
  readonly bump: VersionBump
}

interface Options {
  readonly overdueAfterHours: number
  readonly dryRun?: boolean | undefined
}

const format = (pkg: ReleasePackage) => `${pkg.name}@${pkg.version}`

/**
 * Opens or updates the tracking issue once the version bump is older than the
 * threshold. `diagnoses` only runs when the release is overdue.
 */
const alertIfOverdue = Effect.fnUntraced(function*<R>(
  release: Release,
  effect: ReleasePackage,
  options: Options,
  diagnoses: Effect.Effect<ReadonlyArray<Diagnosis>, never, R>
) {
  const ageHours = ((yield* Clock.currentTimeMillis) - release.bump.committedAt.getTime()) / 3_600_000
  if (ageHours < options.overdueAfterHours) {
    yield* Console.log(`The version bump landed ${ageHours.toFixed(1)} hours ago, so promotion is not overdue yet.`)
    return
  }
  const overdue: OverdueRelease = {
    version: effect.version,
    bump: release.bump,
    overdueAfterHours: options.overdueAfterHours,
    diagnoses: yield* diagnoses
  }
  if (options.dryRun === true) {
    const content = TrackingIssue.render(overdue)
    yield* Console.log(`Would open or update the tracking issue "${content.title}":\n\n${content.body}`)
    return
  }
  yield* (yield* Alerts).open(overdue)
})

const onPromoted = Effect.fnUntraced(function*(
  release: Release,
  effect: ReleasePackage,
  options: Options,
  result: Extract<PromoteResult, { _tag: "Promoted" }>
) {
  const dryRun = options.dryRun === true
  if (result.promoted.length === 0) {
    yield* Console.log("Every package already has latest at or above its target version.")
  }
  for (const pkg of result.promoted) {
    yield* Console.log(`${dryRun ? "Would promote" : "Promoted"} ${format(pkg)} to latest`)
  }

  // Deploy only while `effect`'s live latest is exactly this release. A higher
  // latest means a newer release superseded it and owns the website; a lower
  // one is retried by the next run.
  const deployed = yield* Effect.exit(Effect.gen(function*() {
    const latest = yield* liveLatest(effect.name)
    const atTarget = latest === effect.version || (dryRun && result.promoted.some((pkg) => pkg.name === effect.name))
    if (!atTarget) {
      yield* Console.log(`effect's latest is ${latest}, not ${effect.version}, so the website is not deployed.`)
      return
    }
    if (dryRun) {
      yield* Console.log(`Would deploy the website for ${release.bump.sha} unless a deployment is recorded.`)
      return
    }
    const website = yield* Website
    if (yield* website.isDeployed(release.bump.sha)) {
      return
    }
    yield* website.deploy(release.bump.sha)
    yield* Console.log(`Requested the website deploy for ${release.bump.sha}`)
  }))

  // Every package is at or above its target, so the release no longer needs
  // tracking, whether or not it still owns the website. A failure here is
  // logged and never blocks or fails the deploy.
  if (dryRun) {
    yield* Console.log("Would close the tracking issue, if one is open.")
  } else {
    yield* (yield* Alerts).resolve.pipe(
      Effect.catch((error) => Console.warn(`Could not close the tracking issue: ${error.message}`))
    )
  }
  return yield* deployed
})

/**
 * One scheduled run: promotes the release, deploys the website for the bump
 * commit once `effect`'s `latest` is the target and no deployment is recorded,
 * and opens or resolves the tracking issue.
 *
 * Fails when promotion or the deploy fails. Promotion failures alert when the
 * release is overdue and promotion is known to be pending.
 */
export const promoteRelease = Effect.fnUntraced(function*(
  release: Release,
  options: Options
): Effect.fn.Return<void, NpmPromoteError, HttpClient.HttpClient | NpmCli | Website | Alerts> {
  const effect = release.packages.find((pkg) => pkg.name === "effect")
  if (effect === undefined) {
    return yield* new NpmPromoteError({ message: "The release has no effect package" })
  }

  const result = yield* promote(release.packages, { dryRun: options.dryRun }).pipe(
    Effect.catchTag("PromotionError", (error) =>
      alertIfOverdue(
        release,
        effect,
        options,
        Effect.succeed([{ _tag: "PromotionFailed", pkg: error.pkg, reason: error.reason }])
      ).pipe(
        Effect.catch((alertError) =>
          Console.warn(`Could not open or update the tracking issue: ${alertError.message}`)
        ),
        Effect.andThen(Effect.fail(new NpmPromoteError({ message: error.message, cause: error })))
      )),
    // A read outage alone is not evidence of an overdue promotion.
    Effect.catchTag("RegistryError", (error) => {
      const original = new NpmPromoteError({ message: error.message, cause: error })
      if (!error.promotionPending) {
        return Effect.fail(original)
      }
      // Known-pending read failures are reported as unchecked, never as missing.
      return alertIfOverdue(
        release,
        effect,
        options,
        Effect.succeed([{ _tag: "Unknown", pkg: error.pkg, reason: error.message }])
      ).pipe(
        Effect.catch((alertError) =>
          Console.warn(`Could not open or update the tracking issue: ${alertError.message}`)
        ),
        Effect.andThen(Effect.fail(original))
      )
    })
  )

  if (result._tag === "Promoted") {
    return yield* onPromoted(release, effect, options, result)
  }
  yield* Console.log(
    `Waiting for ${result.pending.length} package(s) to show up in the npm registry:\n${
      result.pending.map((pkg) => `  ${format(pkg)}`).join("\n")
    }`
  )
  yield* alertIfOverdue(release, effect, options, diagnosePending(result.pending))
})

/**
 * Stand-ins for dry runs, which never deploy or touch issues.
 */
export const layerDryRun = Layer.mergeAll(
  Layer.succeed(
    Website,
    Website.of({
      isDeployed: () => Effect.die("Website is not available in a dry run"),
      deploy: () => Effect.die("Website is not available in a dry run")
    })
  ),
  Layer.succeed(
    Alerts,
    Alerts.of({
      open: () => Effect.die("Alerts are not available in a dry run"),
      resolve: Effect.die("Alerts are not available in a dry run")
    })
  )
)
