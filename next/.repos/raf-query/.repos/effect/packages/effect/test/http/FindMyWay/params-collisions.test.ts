import { assert, it } from "@effect/vitest"
import { FindMyWay as Router } from "effect/http"

it("should setup parametric and regexp node", () => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar", 1)
  router.on("GET", "/foo/:bar(123)", 2)

  assert.strictEqual(router.find("GET", "/foo/value")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/123")?.handler, 2)
})

it("should setup parametric and multi-parametric node", () => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar", 1)
  router.on("GET", "/foo/:bar.png", 2)

  assert.strictEqual(router.find("GET", "/foo/value")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 2)
})

it("should throw when set upping two parametric nodes", () => {
  const router = Router.make<number>()
  router.on("GET", "/foo/:bar", 1)
  assert.throws(() => router.on("GET", "/foo/:baz", 2))
})

it("should throw when set upping two regexp nodes", () => {
  const router = Router.make<number>()
  router.on("GET", "/foo/:bar(123)", 1)
  assert.throws(() => router.on("GET", "/foo/:bar(456)", 2))
})

it("should set up two parametric nodes with static ending", () => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar.png", 1)
  router.on("GET", "/foo/:bar.jpeg", 2)

  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.jpeg")?.handler, 2)
})

it("should set up two regexp nodes with static ending", () => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar(123).png", 1)
  router.on("GET", "/foo/:bar(456).jpeg", 2)

  assert.strictEqual(router.find("GET", "/foo/123.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/456.jpeg")?.handler, 2)
})

it("node with longer static suffix should have higher priority", () => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar.png", 1)
  router.on("GET", "/foo/:bar.png.png", 2)

  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.png.png")?.handler, 2)
})

it("node with longer static suffix should have higher priority", () => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar.png.png", 2)
  router.on("GET", "/foo/:bar.png", 1)

  assert.strictEqual(router.find("GET", "/foo/value.png")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/value.png.png")?.handler, 2)
})

it("should set up regexp node and node with static ending", () => {
  const router = Router.make<number>()

  router.on("GET", "/foo/:bar(123)", 1)
  router.on("GET", "/foo/:bar(123).jpeg", 2)

  assert.strictEqual(router.find("GET", "/foo/123")?.handler, 1)
  assert.strictEqual(router.find("GET", "/foo/123.jpeg")?.handler, 2)
})

it("distinguishes routes with different static parts between parameters", () => {
  const router = Router.make<string>()

  router.on("GET", "/foo/:a-:b", "dash")
  router.on("GET", "/foo/:a.:b", "dot")

  assert.strictEqual(router.find("GET", "/foo/x-y")?.handler, "dash")
  assert.strictEqual(router.find("GET", "/foo/x.y")?.handler, "dot")
})

it("preserves prototype-sensitive parameter names as own properties", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/foo/:__proto__/:constructor/:toString", true)

  const params = router.find("GET", "/foo/a/b/c")!.params
  assert.strictEqual(Object.getPrototypeOf(params), null)
  assert.deepStrictEqual(Object.entries(params), [["__proto__", "a"], ["constructor", "b"], ["toString", "c"]])
})
