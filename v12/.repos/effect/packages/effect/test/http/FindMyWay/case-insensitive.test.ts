import { assert, it } from "@effect/vitest"
import { FindMyWay as Router } from "effect/http"

const make = () =>
  Router.make<boolean>({
    caseSensitive: false
  })

it("case insensitive static routes of level 1", () => {
  const router = make()
  router.on("GET", "/woo", true)
  assert(router.find("GET", "/woo")?.handler)
})

it("case insensitive static routes of level 2", () => {
  const router = make()
  router.on("GET", "/foo/woo", true)
  assert(router.find("GET", "/FoO/WOO")?.handler)
})

it("case insensitive static routes of level 3", () => {
  const router = make()
  router.on("GET", "/foo/bar/woo", true)
  assert(router.find("GET", "/Foo/bAR/WoO")?.handler)
})

it("parametric case insensitive", () => {
  const router = make()
  router.on("GET", "/foo/:param", true)
  const result = router.find("GET", "/Foo/bAR")
  assert(result)
  assert(result.handler)
  assert(result.params.param === "bAR")
})

it("parametric case insensitive with a static part", () => {
  const router = make()
  router.on("GET", "/foo/my-:param", true)
  const result = router.find("GET", "/Foo/MY-bAR")
  assert(result)
  assert(result.handler)
  assert(result.params.param === "bAR")
})

it("parametric case insensitive with capital letter", () => {
  const router = make()
  router.on("GET", "/foo/:Param", true)
  const result = router.find("GET", "/Foo/bAR")
  assert(result)
  assert(result.handler)
  assert(result.params.Param === "bAR")
})

it("case insensitive with capital letter in static path with param", () => {
  const router = make()
  router.on("GET", "/Foo/bar/:param", true)
  const result = router.find("GET", "/foo/bar/baZ")
  assert(result)
  assert(result.handler)
  assert(result.params.param === "baZ")
})

it("case insensitive with multiple paths containing capital letter in static path with param", () => {
  const router = make()
  router.on("GET", "/Foo/bar/:param", true)
  router.on("GET", "/Foo/baz/:param", true)

  let result = router.find("GET", "/foo/bar/baZ")
  assert(result)
  assert(result.handler)
  assert(result.params.param === "baZ")

  result = router.find("GET", "/foo/bar/baR")
  assert(result)
  assert(result.handler)
  assert(result.params.param === "baR")
})

it("case insensitive with multiple mixed-case params within same slash couple", () => {
  const router = make()
  router.on("GET", "/foo/:param1-:param2", true)

  const result = router.find("GET", "/FOO/My-bAR")
  assert(result)
  assert(result.handler)
  assert(result.params.param1 === "My")
  assert(result.params.param2 === "bAR")
})

it("case insensitive with multiple mixed-case params", () => {
  const router = make()
  router.on("GET", "/foo/:param1/:param2", true)

  const result = router.find("GET", "/FOO/My/bAR")
  assert(result)
  assert(result.handler)
  assert(result.params.param1 === "My")
  assert(result.params.param2 === "bAR")
})

it("case insensitive with wildcard", () => {
  const router = make()
  router.on("GET", "/foo/*", true)

  const result = router.find("GET", "/FOO/bAR")
  assert(result)
  assert(result.handler)
  assert(result.params["*"] === "bAR")
})

it("parametric case insensitive with multiple routes", () => {
  const router = make()
  const tests = [
    [
      "POST",
      "/foo/:param/Static/:userId/Save",
      "/foo/bAR/static/one/SAVE",
      {
        param: "bAR",
        userId: "one"
      }
    ],
    [
      "POST",
      "/foo/:param/Static/:userId/Update",
      "/fOO/Bar/Static/two/update",
      {
        param: "Bar",
        userId: "two"
      }
    ],
    [
      "POST",
      "/foo/:param/Static/:userId/CANCEL",
      "/Foo/bAR/STATIC/THREE/cAnCeL",
      {
        param: "bAR",
        userId: "THREE"
      }
    ]
  ] as const

  tests.forEach(([method, path]) => {
    router.on(method, path, true)
  })

  tests.forEach(([method, , url, params]) => {
    const result = router.find(method, url)
    assert(result)
    assert(result.handler)
    assert.deepStrictEqual(result.params, params)
  })
})
