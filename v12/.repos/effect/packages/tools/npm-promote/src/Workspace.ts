import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import type { ReleasePackage } from "./NpmPromote.ts"
import { NpmPromoteError } from "./NpmPromoteError.ts"
import * as Process from "./Process.ts"

export interface WorkspacePackage extends ReleasePackage {
  readonly directory: string
}

const PnpmList = Schema.fromJsonString(Schema.Array(Schema.Struct({
  name: Schema.optional(Schema.NullOr(Schema.String)),
  version: Schema.optional(Schema.NullOr(Schema.String)),
  path: Schema.String,
  private: Schema.optional(Schema.Boolean)
})))

/**
 * Lists the non-private workspace packages with their versions at the
 * checked-out revision. These are the packages `changeset publish` releases.
 */
export const releasePackages = (
  cwd: string
): Effect.Effect<ReadonlyArray<WorkspacePackage>, NpmPromoteError, ChildProcessSpawner.ChildProcessSpawner> =>
  Process.run("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"], { cwd }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PnpmList)),
    Effect.mapError((cause) =>
      Schema.is(NpmPromoteError)(cause) ? cause : new NpmPromoteError({
        message: "Could not read the pnpm workspace package list",
        cause
      })
    ),
    Effect.map((packages) =>
      packages.flatMap((pkg) =>
        pkg.private !== true && typeof pkg.name === "string" && typeof pkg.version === "string"
          ? [{ name: pkg.name, version: pkg.version, directory: pkg.path }]
          : []
      )
    )
  )

export interface VersionBump {
  readonly sha: string
  readonly committedAt: Date
}

/**
 * Finds the newest commit that changed the `version` field of the package in
 * `directory`. Fails in a shallow clone, which would report its boundary
 * commit instead.
 */
export const versionBump = (
  directory: string
): Effect.Effect<Option.Option<VersionBump>, NpmPromoteError, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function*() {
    const shallow = yield* Process.run("git", ["rev-parse", "--is-shallow-repository"], { cwd: directory })
    if (shallow.trim() !== "false") {
      return yield* new NpmPromoteError({ message: "Finding the version bump commit needs a full clone" })
    }
    return yield* Process.run("git", ["log", "-1", "--format=%H %cI", "-G", "\"version\":", "--", "package.json"], {
      cwd: directory
    })
  }).pipe(
    Effect.map((output) => {
      const [sha, committedAt] = output.trim().split(" ")
      return sha && committedAt ? Option.some({ sha, committedAt: new Date(committedAt) }) : Option.none()
    })
  )
