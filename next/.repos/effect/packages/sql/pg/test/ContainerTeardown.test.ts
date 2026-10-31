import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Option } from "effect"
import { TestClock } from "effect/testing"
import * as Http from "node:http"
import { BoundPorts, getContainerRuntimeClient } from "testcontainers"
import { afterAll, beforeAll, vi } from "vitest"
import { pgWaitStrategy, releasePgContainer } from "./utils.ts"

// Less than the existing 30s integration hook limit, including all retry attempts.
const cleanupBudget = "25 seconds"
const testTimeout = 28_000

describe("PostgreSQL container lifecycle", () => {
  const requests = new Map<string, Array<string>>()
  const interruptedResponses = new Map<string, number>()
  const unexpected: Array<string> = []
  let infoRequests = 0
  const server = Http.createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost")
    response.setHeader("Content-Type", "application/json")
    // Bun re-sends a request that fails on a reused keep-alive socket. Fresh
    // connections keep one HTTP request per release attempt on every runtime.
    response.setHeader("Connection", "close")
    if (url.pathname === "/info") {
      infoRequests++
      response.end(JSON.stringify({ ServerVersion: "27.0.0", OperatingSystem: "Docker", OSType: "linux" }))
      return
    }
    const match = /^\/containers\/([^/]+)(\/wait|\/json|\/exec)?$/.exec(url.pathname)
    if (match === null || !requests.has(match[1])) {
      unexpected.push(request.method + " " + request.url)
      response.writeHead(404).end(JSON.stringify({ message: "Unexpected request" }))
      return
    }
    const id = match[1]
    const steps = requests.get(id)!
    if (request.method === "GET" && match[2] === "/json") {
      steps.push("inspect")
      response.end(
        JSON.stringify({ Id: id, State: { Status: "running", Running: true, Health: { Status: "healthy" } } })
      )
    } else if (request.method === "POST" && match[2] === "/exec") {
      // An exec that never completes, as observed under Deno in CI.
      steps.push("exec")
    } else if (request.method === "POST" && match[2] === "/wait") {
      steps.push("wait")
      assert.strictEqual(url.searchParams.get("condition"), "not-running")
      const attempt = steps.filter((step) => step === "wait").length
      // A wait response that never arrives, as observed under Bun in CI.
      if (id === "wait-hangs") return void response.flushHeaders()
      if (id === "always-interrupted" || attempt === 1) {
        // Docker flushes the wait headers before writing its JSON body. Close
        // after a partial body, deterministically exercising docker-modem's
        // aborted-response path, not a probabilistic keep-alive reuse race.
        response.flushHeaders()
        response.write("{\"StatusCode\":", () => {
          interruptedResponses.set(id, (interruptedResponses.get(id) ?? 0) + 1)
          response.socket!.end()
        })
      } else {
        response.end(JSON.stringify({ StatusCode: 137 }))
      }
    } else if (request.method === "DELETE" && match[2] === undefined) {
      steps.push("remove")
      assert.strictEqual(url.searchParams.get("v"), "true")
      response.writeHead(204).end()
    } else {
      unexpected.push(request.method + " " + request.url)
      response.writeHead(404).end(JSON.stringify({ message: "Unexpected request" }))
    }
  })

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Expected a TCP listener")
    vi.stubEnv("DOCKER_HOST", "tcp://127.0.0.1:" + address.port)
    vi.stubEnv("DOCKER_TLS_VERIFY", "0")
    // Initialize the real testcontainers/dockerode client against our daemon.
    // It is cached for this isolated test file; no real Docker is required.
    try {
      await getContainerRuntimeClient()
      assert.strictEqual(infoRequests, 1, "runtime client must use the mock daemon")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      // Register closure before destroying connections: Bun also stops the
      // listener in closeAllConnections, so closing it afterwards fails.
      server.close((error) => error ? reject(error) : resolve())
      server.closeAllConnections()
    })
  })

  it.live("startup readiness does not depend on docker exec completing", () =>
    Effect.gen(function*() {
      requests.set("exec-hangs", [])
      const client = yield* Effect.promise(() => getContainerRuntimeClient())
      const ports = new BoundPorts()
      ports.setBinding(5432, (server.address() as { port: number }).port)
      const result = yield* Effect.promise(() =>
        pgWaitStrategy().waitUntilReady(client.container.getById("exec-hangs"), ports)
      ).pipe(Effect.timeoutOption("5 seconds"))
      assert.isTrue(Option.isSome(result), "readiness waited on a docker exec that never completed")
      assert.deepStrictEqual(requests.get("exec-hangs"), ["inspect"])
      assert.deepStrictEqual(unexpected, [])
    }), testTimeout)

  const container = (id: string) => {
    const steps: Array<string> = []
    requests.set(id, steps)
    return {
      getId: () => id,
      stop: async (options: { remove: boolean }) => {
        assert.deepStrictEqual(options, { remove: false })
        steps.push("stop")
      }
    }
  }

  it.live("retries an interrupted wait response before removing the container", () =>
    Effect.gen(function*() {
      const result = yield* releasePgContainer(container("retry-succeeds")).pipe(
        Effect.exit,
        Effect.timeoutOption(cleanupBudget)
      )
      assert.strictEqual(interruptedResponses.get("retry-succeeds"), 1, "daemon did not interrupt the first wait")
      assert.isTrue(Option.isSome(result), "teardown exceeded the cleanup budget")
      if (Option.isNone(result)) return
      assert.isTrue(Exit.isSuccess(result.value), "teardown failed instead of retrying")
      assert.deepStrictEqual(requests.get("retry-succeeds"), ["stop", "wait", "wait", "remove"])
      assert.deepStrictEqual(unexpected, [])
    }), testTimeout)

  it.live(
    "surfaces repeated interrupted waits within the cleanup budget without removing",
    () =>
      Effect.gen(function*() {
        const result = yield* releasePgContainer(container("always-interrupted")).pipe(
          Effect.exit,
          Effect.timeoutOption(cleanupBudget)
        )
        assert.isAtLeast(interruptedResponses.get("always-interrupted")!, 1, "daemon did not interrupt a wait")
        assert.isTrue(Option.isSome(result), "teardown hung instead of reporting exhausted retries")
        if (Option.isNone(result)) return
        assert.isTrue(Exit.isFailure(result.value), "cleanup failure was suppressed")
        if (Exit.isSuccess(result.value)) return
        assert.isFalse(Cause.hasInterruptsOnly(result.value.cause), "failure must be visible, not just interruption")
        const steps = requests.get("always-interrupted")!
        assert.strictEqual(steps[0], "stop")
        assert.isAtLeast(interruptedResponses.get("always-interrupted")!, 2)
        assert.isAtMost(interruptedResponses.get("always-interrupted")!, 3)
        assert.isFalse(steps.includes("remove"), "remove ran without a successful wait")
        assert.deepStrictEqual(unexpected, [])
      }),
    testTimeout
  )

  // `it.layer` provides TestClock to fixture layers, so their finalizers
  // run with it during afterAll.
  it.effect("bounds a hung wait under the test services used by it.layer", () =>
    Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(releasePgContainer(container("wait-hangs")).pipe(Effect.exit))
      const result = yield* Fiber.join(fiber).pipe(Effect.timeoutOption(cleanupBudget), TestClock.withLive)
      assert.isTrue(Option.isSome(result), "teardown hung instead of reporting exhausted retries")
      if (Option.isNone(result)) return yield* Fiber.interrupt(fiber)
      assert.isTrue(Exit.isFailure(result.value), "cleanup failure was suppressed")
      assert.isFalse(requests.get("wait-hangs")!.includes("remove"), "remove ran without a successful wait")
    }), testTimeout)
})
