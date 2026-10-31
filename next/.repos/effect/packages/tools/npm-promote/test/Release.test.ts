import { NpmCli, NpmPromoteError } from "@effect/npm-promote"
import { Alerts, promoteRelease, type Release, Website } from "@effect/npm-promote/Release"
import type { OverdueRelease } from "@effect/npm-promote/TrackingIssue"
import { assert, describe, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HttpClient from "effect/http/HttpClient"
import * as Option from "effect/Option"
import { TestClock } from "effect/testing"
import { type Published, registryClient } from "./utils.ts"

const release: Release = {
  packages: [
    { name: "effect", version: "4.0.4" },
    { name: "@effect/sql-pg", version: "4.0.4" }
  ],
  bump: { sha: "a".repeat(40), committedAt: new Date(0) }
}

const services = (options: {
  readonly registry: Record<string, Published>
  readonly addDistTag: NpmCli["Service"]["addDistTag"]
  readonly website: Website["Service"]
  readonly alerts: Array<OverdueRelease>
  readonly openAlert?: Alerts["Service"]["open"]
}) =>
<A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient | NpmCli | Website | Alerts>) =>
  effect.pipe(
    Effect.provideService(HttpClient.HttpClient, registryClient(options.registry)),
    Effect.provideService(NpmCli, NpmCli.of({ addDistTag: options.addDistTag })),
    Effect.provideService(Website, options.website),
    Effect.provideService(
      Alerts,
      Alerts.of({
        open: (overdue) =>
          Effect.sync(() => options.alerts.push(overdue)).pipe(
            Effect.andThen(options.openAlert === undefined ? Effect.void : options.openAlert(overdue))
          ),
        resolve: Effect.void
      })
    )
  )

describe("Release", () => {
  for (const endpoint of ["metadata", "live tags"] as const) {
    it.effect(
      `does not alert for an overdue ${endpoint} read failure without evidence of pending promotion`,
      () =>
        Effect.gen(function*() {
          const alerts: Array<OverdueRelease> = []
          const provide = services({
            registry: {
              "effect": { latest: "4.0.4", versions: ["4.0.4"] },
              "@effect/sql-pg": {
                latest: "4.0.4",
                versions: ["4.0.4"],
                ...(endpoint === "metadata" ? { metadataStatus: 403 } : { liveTagsStatus: 403 })
              }
            },
            addDistTag: () => Effect.die("an already-promoted release must not write tags"),
            website: Website.of({
              isDeployed: () => Effect.die("a read failure must stop before deployment"),
              deploy: () => Effect.die("a read failure must stop before deployment")
            }),
            alerts
          })
          yield* TestClock.adjust("13 hours")

          const exit = yield* Effect.exit(provide(promoteRelease(release, { overdueAfterHours: 12 })))

          assert.isTrue(Exit.isFailure(exit))
          if (Exit.isFailure(exit)) {
            const error = Option.getOrThrow(Cause.findErrorOption(exit.cause))
            assert.include(error.message, "@effect/sql-pg")
          }
          assert.deepStrictEqual(alerts, [])
        })
    )
  }

  for (const failure of ["write", "read after partial promotion"] as const) {
    it.effect(
      `preserves the original ${failure} failure when overdue alerting fails`,
      () =>
        Effect.gen(function*() {
          const alerts: Array<OverdueRelease> = []
          const distTagCalls: Array<string> = []
          const provide = services({
            registry: {
              "effect": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] },
              "@effect/sql-pg": {
                latest: "4.0.3",
                versions: ["4.0.3", "4.0.4"],
                ...(failure === "read after partial promotion" ? { liveTagsStatus: 403 } : {})
              }
            },
            addDistTag: ({ name, tag, version }) =>
              Effect.sync(() => distTagCalls.push(`${name}@${version} ${tag}`)).pipe(
                Effect.andThen(
                  failure === "write"
                    ? Effect.fail(new NpmPromoteError({ message: "npm error code E401" }))
                    : Effect.void
                )
              ),
            website: Website.of({
              isDeployed: () => Effect.die("a promotion failure must stop before deployment"),
              deploy: () => Effect.die("a promotion failure must stop before deployment")
            }),
            alerts,
            openAlert: () => Effect.fail(new NpmPromoteError({ message: "GitHub alert unavailable" }))
          })
          yield* TestClock.adjust("13 hours")

          const exit = yield* Effect.exit(provide(promoteRelease(release, { overdueAfterHours: 12 })))

          assert.deepStrictEqual(distTagCalls, ["effect@4.0.4 latest"])
          assert.deepStrictEqual(
            alerts.map((alert) => alert.diagnoses.map((diagnosis) => ({ _tag: diagnosis._tag, pkg: diagnosis.pkg }))),
            [[
              failure === "write"
                ? { _tag: "PromotionFailed", pkg: { name: "effect", version: "4.0.4" } }
                : { _tag: "Unknown", pkg: { name: "@effect/sql-pg", version: "4.0.4" } }
            ]]
          )
          assert.isTrue(Exit.isFailure(exit))
          if (Exit.isFailure(exit)) {
            const error = Option.getOrThrow(Cause.findErrorOption(exit.cause))
            assert.strictEqual(
              error.message,
              failure === "write"
                ? "Could not move latest to effect@4.0.4: npm error code E401"
                : "Could not read the dist-tags of @effect/sql-pg while promoting @effect/sql-pg@4.0.4"
            )
          }
        })
    )
  }

  it.effect("retries a failed website deploy on the next run, then stops", () =>
    Effect.gen(function*() {
      const deployed = new Set<string>()
      const attempts: Array<string> = []
      const provide = services({
        registry: {
          "effect": { latest: "4.0.4", versions: ["4.0.3", "4.0.4"] },
          "@effect/sql-pg": { latest: "4.0.4", versions: ["4.0.3", "4.0.4"] }
        },
        addDistTag: () => Effect.die("latest is already the target"),
        website: Website.of({
          isDeployed: (revision) => Effect.sync(() => deployed.has(revision)),
          deploy: (revision) =>
            Effect.suspend(() => {
              attempts.push(revision)
              if (attempts.length === 1) {
                return Effect.fail(new NpmPromoteError({ message: "dispatch failed" }))
              }
              deployed.add(revision)
              return Effect.void
            })
        }),
        alerts: []
      })
      const runOnce = Effect.exit(provide(promoteRelease(release, { overdueAfterHours: 12 })))

      const first = yield* runOnce
      yield* runOnce
      yield* runOnce

      assert.isTrue(Exit.isFailure(first))
      assert.deepStrictEqual(attempts, [release.bump.sha, release.bump.sha])
    }))

  it.effect("alerts when an overdue release cannot be promoted", () =>
    Effect.gen(function*() {
      const distTagCalls: Array<string> = []
      const alerts: Array<OverdueRelease> = []
      const provide = services({
        registry: {
          "effect": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] },
          "@effect/sql-pg": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] }
        },
        addDistTag: ({ name, tag, version }) =>
          Effect.suspend(() => {
            distTagCalls.push(`${name}@${version} ${tag}`)
            return Effect.fail(new NpmPromoteError({ message: "npm error code E401" }))
          }),
        website: Website.of({ isDeployed: () => Effect.succeed(false), deploy: () => Effect.void }),
        alerts
      })
      yield* TestClock.adjust("13 hours")

      const exit = yield* Effect.exit(provide(promoteRelease(release, { overdueAfterHours: 12 })))

      assert.isTrue(Exit.isFailure(exit))
      assert.deepStrictEqual(distTagCalls, ["effect@4.0.4 latest"])
      assert.deepStrictEqual(alerts, [{
        version: "4.0.4",
        bump: release.bump,
        overdueAfterHours: 12,
        diagnoses: [{
          _tag: "PromotionFailed",
          pkg: { name: "effect", version: "4.0.4" },
          reason: "npm error code E401"
        }]
      }])
    }))

  it.effect("alerts when an overdue release cannot read the registry", () =>
    Effect.gen(function*() {
      const distTagCalls: Array<string> = []
      const alerts: Array<OverdueRelease> = []
      const provide = services({
        registry: {
          "effect": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] },
          "@effect/sql-pg": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"], liveTagsStatus: 403 }
        },
        addDistTag: ({ name, tag, version }) => Effect.sync(() => distTagCalls.push(`${name}@${version} ${tag}`)),
        website: Website.of({ isDeployed: () => Effect.succeed(false), deploy: () => Effect.void }),
        alerts
      })
      yield* TestClock.adjust("13 hours")

      const exit = yield* Effect.exit(provide(promoteRelease(release, { overdueAfterHours: 12 })))

      assert.isTrue(Exit.isFailure(exit))
      assert.deepStrictEqual(distTagCalls, ["effect@4.0.4 latest"])
      // The read failed, so the version is reported as unchecked rather than missing.
      assert.deepStrictEqual(
        alerts.map((alert) => alert.diagnoses.map((diagnosis) => ({ _tag: diagnosis._tag, pkg: diagnosis.pkg }))),
        [[{ _tag: "Unknown", pkg: { name: "@effect/sql-pg", version: "4.0.4" } }]]
      )
    }))
})
