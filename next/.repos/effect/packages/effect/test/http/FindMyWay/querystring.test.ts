import { assert, it } from "@effect/vitest"
import { FindMyWay as Router } from "effect/http"

it("should sanitize the url - query", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test", true)
  assert.deepStrictEqual(
    router.find("GET", "/test?hello=world")?.searchParams,
    { hello: "world" }
  )
})

it("should sanitize the url - hash", () => {
  const router = Router.make<boolean>()

  router.on("GET", "/test", true)

  assert.deepStrictEqual(router.find("GET", "/test#hello")?.searchParams, {
    hello: ""
  })
})

it("handles path and query separated by ;", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test", true)
  assert.deepStrictEqual(
    router.find("GET", "/test;jsessionid=123456")?.searchParams,
    { jsessionid: "123456" }
  )
})

it("handles %", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/test", true)
  assert.deepStrictEqual(router.find("GET", "/test?%")?.searchParams, {
    "%": ""
  })
})

it("normalizes duplicate path slashes without changing query slashes", () => {
  const router = Router.make<boolean>()
  router.on("GET", "/user/:id", true)
  const result = router.find("GET", "//user//1?u=https://x.com/y")
  assert.deepStrictEqual(result?.params, { id: "1" })
  assert.deepStrictEqual(result?.searchParams, { u: "https://x.com/y" })
})
