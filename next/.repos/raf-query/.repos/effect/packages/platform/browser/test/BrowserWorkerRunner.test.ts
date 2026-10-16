import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Queue from "effect/Queue"

type Listener = EventListenerOrEventListenerObject

const makePort = () => {
  const listeners = new Map<string, Set<Listener>>()
  const added: Array<readonly [string, Listener]> = []
  const removed: Array<readonly [string, Listener]> = []
  const port = {
    addEventListener(type: string, listener: Listener | null) {
      if (listener === null) return
      added.push([type, listener])
      const eventListeners = listeners.get(type) ?? new Set()
      eventListeners.add(listener)
      listeners.set(type, eventListeners)
    },
    removeEventListener(type: string, listener: Listener | null) {
      if (listener === null) return
      removed.push([type, listener])
      listeners.get(type)?.delete(listener)
    },
    postMessage() {},
    start() {},
    close() {}
  } as unknown as MessagePort

  return {
    added,
    removed,
    port,
    emit(type: string, data: unknown) {
      const event = { data } as MessageEvent
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") {
          listener(event)
        } else {
          listener.handleEvent(event)
        }
      }
    }
  }
}

const makeSharedWorker = () => {
  const worker = {
    onconnect: null as ((event: MessageEvent) => void) | null,
    addEventListener() {},
    removeEventListener() {},
    close() {}
  }
  return {
    worker: worker as unknown as Window,
    connect(port: MessagePort) {
      worker.onconnect?.({ ports: [port] } as unknown as MessageEvent)
    }
  }
}

describe("BrowserWorkerRunner", () => {
  it.effect("removes the registered messageerror listener", () =>
    Effect.gen(function*() {
      const fake = makePort()
      const runner = yield* BrowserWorkerRunner.make(fake.port).start()
      const fiber = yield* Effect.forkChild(runner.run<void, never, never>(() => {}))
      yield* Effect.yieldNow

      fake.emit("message", [1])
      yield* Fiber.join(fiber)

      const added = fake.added.find(([type]) => type === "messageerror")
      const removed = fake.removed.find(([type]) => type === "messageerror")
      assert.isDefined(added)
      assert.isDefined(removed)
      assert.strictEqual(removed[1], added[1])
    }))

  it.effect("emits disconnects for closed SharedWorker ports", () =>
    Effect.gen(function*() {
      const sharedWorker = makeSharedWorker()
      const first = makePort()
      const second = makePort()
      const runner = yield* BrowserWorkerRunner.make(sharedWorker.worker).start()
      const fiber = yield* Effect.forkChild(runner.run<void, never, never>(() => {}))
      yield* Effect.yieldNow

      sharedWorker.connect(first.port)
      sharedWorker.connect(second.port)
      first.emit("message", [1])

      const disconnects = runner.disconnects
      assert.isDefined(disconnects)
      assert.strictEqual(yield* Queue.take(disconnects), 0)

      second.emit("message", [1])
      yield* Fiber.join(fiber)
    }))
})
