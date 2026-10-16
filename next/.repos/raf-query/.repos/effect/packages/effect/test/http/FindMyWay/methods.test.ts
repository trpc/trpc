import { assert, it } from "@effect/vitest"
import { FindMyWay as Router } from "effect/http"

it("returns undefined for method names inherited from Object.prototype", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/", true)

  assert.isUndefined(router.find("constructor", "/"))
})

it("registers QUERY with all", () => {
  const router = Router.make<boolean>()
  router.all("/all", true)

  assert.strictEqual(router.find("QUERY", "/all")?.handler, true)
})
