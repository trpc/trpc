/**
 * Discovers the TypeScript entrypoint fixtures used by the bundle-size tools.
 *
 * The bundle CLI uses these fixture names to build current bundle reports,
 * compare them against a base directory, and populate the visualization
 * selector. Fixtures are intentionally discovered from the package's local
 * `fixtures` directory as top-level `.ts` files and sorted by name so reports
 * are deterministic.
 *
 * When adding or renaming fixtures, keep in mind that comparison reports match
 * files by basename between the current fixtures directory and the provided
 * base directory. New fixtures without a matching base file are reported as
 * unchanged. Each fixture is bundled as its own Rollup entrypoint, so it should
 * represent the import shape being measured and avoid depending on incidental
 * fixture discovery order.
 *
 * @since 4.0.0
 */
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Glob from "glob"
import { fileURLToPath } from "node:url"

/**
 * Context service that discovers and sorts TypeScript fixture files used by the bundle size tooling.
 *
 * @category services
 * @since 4.0.0
 */
export class Fixtures extends Context.Service<Fixtures>()(
  "@effect/bundle/Fixtures",
  {
    make: Effect.gen(function*() {
      const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url))

      const fixtures = yield* Effect.promise(() => Glob.glob("*.ts", { cwd: fixturesDir })).pipe(
        Effect.map(Array.sort(Order.String)),
        Effect.orDie
      )

      return {
        fixtures,
        fixturesDir
      } as const
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make)
}
