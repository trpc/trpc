import { assert, it } from "@effect/vitest"
import { FindMyWay as Router } from "effect/http"

it("path params match", () => {
  const router = Router.make<1 | 2 | "c" | "param">()

  router.on("GET", "/ab1", 1)
  router.on("GET", "/ab2", 2)
  router.on("GET", "/ac", "c")
  router.on("GET", "/:pam", "param")

  assert.strictEqual(router.find("GET", "/ab1")?.handler, 1)
  assert.strictEqual(router.find("GET", "/ab1/")?.handler, 1)
  assert.strictEqual(router.find("GET", "//ab1")?.handler, 1)
  assert.strictEqual(router.find("GET", "//ab1//")?.handler, 1)
  assert.strictEqual(router.find("GET", "/ab2")?.handler, 2)
  assert.strictEqual(router.find("GET", "/ab2/")?.handler, 2)
  assert.strictEqual(router.find("GET", "//ab2")?.handler, 2)
  assert.strictEqual(router.find("GET", "//ab2//")?.handler, 2)
  assert.strictEqual(router.find("GET", "/ac")?.handler, "c")
  assert.strictEqual(router.find("GET", "/ac/")?.handler, "c")
  assert.strictEqual(router.find("GET", "//ac")?.handler, "c")
  assert.strictEqual(router.find("GET", "//ac//")?.handler, "c")
  assert.strictEqual(router.find("GET", "/foo")?.handler, "param")
  assert.strictEqual(router.find("GET", "/foo/")?.handler, "param")
  assert.strictEqual(router.find("GET", "//foo")?.handler, "param")
  assert.strictEqual(router.find("GET", "//foo//")?.handler, "param")
  assert.deepStrictEqual(router.find("GET", "/abcdef"), {
    handler: "param",
    params: { pam: "abcdef" },
    searchParams: {}
  })
  assert.deepStrictEqual(router.find("GET", "/abcdef/"), {
    handler: "param",
    params: { pam: "abcdef" },
    searchParams: {}
  })
  assert.deepStrictEqual(router.find("GET", "//abcdef"), {
    handler: "param",
    params: { pam: "abcdef" },
    searchParams: {}
  })
})

it("builds null-prototype params for static and parameterized routes", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/health", true)
  router.on("GET", "/users/:id", true)
  router.on("GET", "/orgs/:org/repos/:repo", true)

  for (
    const [path, expected] of [
      ["/health", {}],
      ["/users/42", { id: "42" }],
      ["/orgs/effect/repos/core", { org: "effect", repo: "core" }]
    ] as const
  ) {
    const params = router.find("GET", path)!.params
    assert.strictEqual(Object.getPrototypeOf(params), null)
    assert.deepStrictEqual({ ...params }, expected)
  }
})

it("does not compile parameter names with Function", () => {
  const OriginalFunction = globalThis.Function
  let constructions = 0
  globalThis.Function = new Proxy(OriginalFunction, {
    construct(target, args, newTarget) {
      constructions++
      return Reflect.construct(target, args, newTarget)
    }
  })
  try {
    const router = Router.make<boolean>()
    router.on("GET", "/users/:id", true)
    router.on("GET", "/orgs/:org/repos/:repo", true)
    assert.deepStrictEqual({ ...router.find("GET", "/users/42")!.params }, { id: "42" })
    assert.deepStrictEqual({ ...router.find("GET", "/orgs/effect/repos/core")!.params }, {
      org: "effect",
      repo: "core"
    })
  } finally {
    globalThis.Function = OriginalFunction
  }
  assert.strictEqual(constructions, 0)
})

it("does not read inherited static child entries", () => {
  const label = "\uE000"
  // oxlint-disable-next-line no-extend-native -- Reproduce an inherited entry without reaching into router internals.
  Object.defineProperty(Object.prototype, label, {
    configurable: true,
    value: {}
  })

  try {
    const router = Router.make<boolean>()
    router.on("GET", `/${label}`, true)

    assert.strictEqual(router.find("GET", `/${label}`)?.handler, true)
  } finally {
    Reflect.deleteProperty(Object.prototype, label)
  }
})
