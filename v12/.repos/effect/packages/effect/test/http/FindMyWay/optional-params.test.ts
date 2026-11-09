import { assert, it } from "@effect/vitest"
import { FindMyWay as Router } from "effect/http"

it("Test route with optional parameter", () => {
  const router = Router.make<boolean>()

  router.on("GET", "/a/:param/b/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/a/foo-bar/b")?.params, {
    param: "foo-bar"
  })
  assert.deepStrictEqual(router.find("GET", "/a/foo-bar/b/foo")?.params, {
    param: "foo-bar",
    optional: "foo"
  })
})

it("Test for duplicate route with optional param", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/foo/:bar?", true)
  assert.throws(() => router.on("GET", "/foo", true))
})

it("Test for param with ? not at the end", () => {
  const router = Router.make<boolean>()

  assert.throws(() => router.on("GET", "/foo/:bar?/baz", true))
})

it("Multi parametric route with optional param", () => {
  const router = Router.make<boolean>()

  router.on("GET", "/a/:p1-:p2?", true)

  assert.deepStrictEqual(router.find("GET", "/a/foo-bar-baz")?.params, {
    p1: "foo-bar",
    p2: "baz"
  })
  assert.deepStrictEqual(router.find("GET", "/a")?.params, {})
})

it("Optional parameter at root", () => {
  const router = Router.make<boolean>()

  router.on("GET", "/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/foo")?.params, {
    optional: "foo"
  })
})

it("Optional Parameter with ignoreTrailingSlash = true", () => {
  const router = Router.make<boolean>({
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: false
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/test/hello/")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo"
  })
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo/")?.params, {
    optional: "foo"
  })
})

it("Optional Parameter with ignoreTrailingSlash = false", () => {
  const router = Router.make<boolean>({
    ignoreTrailingSlash: false,
    ignoreDuplicateSlashes: false
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/test/hello/")?.params, {
    optional: ""
  })
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo"
  })
  assert.isUndefined(router.find("GET", "/test/hello/foo/"))
})

it("Optional Parameter with ignoreDuplicateSlashes = true", () => {
  const router = Router.make<boolean>({
    ignoreDuplicateSlashes: true
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.deepStrictEqual(router.find("GET", "/test//hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo"
  })
  assert.deepStrictEqual(router.find("GET", "/test//hello//foo")?.params, {
    optional: "foo"
  })
})

it("Optional Parameter with ignoreDuplicateSlashes = false", () => {
  const router = Router.make<boolean>({
    ignoreDuplicateSlashes: false
  })

  router.on("GET", "/test/hello/:optional?", true)

  assert.isUndefined(router.find("GET", "/test//hello"))
  assert.deepStrictEqual(router.find("GET", "/test/hello")?.params, {})
  assert.deepStrictEqual(router.find("GET", "/test/hello/foo")?.params, {
    optional: "foo"
  })
  assert.isUndefined(router.find("GET", "/test//hello//foo"))
})
