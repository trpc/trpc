import { assert, it } from "@effect/vitest"
import { FindMyWay as Router } from "effect/http"

it("route with matching regex", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)", true)
  assert.deepStrictEqual(router.find("GET", "/test/12")?.handler, true)
})

it("route without matching regex", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)", true)
  assert.isUndefined(router.find("GET", "/test/test"))
})

it("route with an extension regex 2", () => {
  const router = Router.make<number>()

  router.on("GET", "/test/S/:file(^\\S+).png", 1)
  router.on("GET", "/test/D/:file(^\\D+).png", 2)

  assert.strictEqual(router.find("GET", "/test/S/foo.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/test/D/foo.png")?.handler, 2)
})

it("nested route with matching regex", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello", true)
  assert.deepStrictEqual(router.find("GET", "/test/12/hello")?.handler, true)
})

it("mixed nested route with matching regex", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello/:world", true)
  assert.deepStrictEqual(router.find("GET", "/test/12/hello/world")?.params, {
    id: "12",
    world: "world"
  })
})

it("mixed nested route with double matching regex", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello/:world(^\\d+$)", true)
  assert.deepStrictEqual(router.find("GET", "/test/12/hello/15")?.params, {
    id: "12",
    world: "15"
  })
})

it("mixed nested route without double matching regex", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)/hello/:world(^\\d+$)", true)
  assert.isUndefined(router.find("GET", "/test/12/hello/test"))
})

it("route with an extension regex", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:file(^\\d+).png", true)
  assert.deepStrictEqual(router.find("GET", "/test/12.png")?.handler, true)
})

it("route with an extension regex - no match", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:file(^\\d+).png", true)
  assert.isUndefined(router.find("GET", "/test/aa.png"))
})

it("safe decodeURIComponent", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id(^\\d+$)", true)
  assert.isUndefined(router.find("GET", "/test/hel%\"Flo"))
})

it("rejects truncated percent encodings", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test/:id", true)

  assert.isUndefined(router.find("GET", "/test/a%"))
  assert.isUndefined(router.find("GET", "/test/a%2"))
})

it("does not match an empty segment against a non-empty regex", () => {
  const router = Router.make<boolean>({
    ignoreTrailingSlash: false
  })
  router.on("GET", "/users/:userId(^\\d+)", true)

  assert.isUndefined(router.find("GET", "/users/"))
})

it("matches undefined regex captures as empty strings", () => {
  const router = Router.make<boolean>({
    ignoreTrailingSlash: false
  })
  router.on("GET", "/test/:id(^((?!abc).)*$)", true)

  assert.deepStrictEqual(router.find("GET", "/test/")?.params, {
    id: ""
  })
})

it("falls back when a parameter exceeds maxParamLength", () => {
  const router = Router.make<string>({
    maxParamLength: 3
  })
  router.on("GET", "/users/:userId", "parameter")
  router.on("GET", "/users/*", "wildcard")

  assert.strictEqual(router.find("GET", "/users/long")?.handler, "wildcard")
})

it("avoids backtracking across static parameter separators", { timeout: 1_000 }, () => {
  const router = Router.make<boolean>()
  router.on("GET", "/:foo-:bar-", true)

  router.find("GET", "/" + "-".repeat(16_000) + "a")
})

it("avoids backtracking across mixed static parameter separators", { timeout: 1_000 }, () => {
  const router = Router.make<boolean>()
  router.on("GET", "/:foo-:bar-", true)

  router.find("GET", "/" + "a-".repeat(8_000) + "b")
})
