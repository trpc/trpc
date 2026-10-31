import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { AsyncResult, Atom, AtomRegistry, Hydration } from "effect/reactivity"

describe("Hydration", () => {
  it("runs a plain hydrated effect atom on mount and tracks factory dependencies", () => {
    const dependency = Atom.make(1)
    let runs = 0
    const atom = Atom.make((get) => {
      const value = get(dependency)
      return Effect.sync(() => {
        runs++
        return value
      })
    }).pipe(
      Atom.serializable({ key: "count", schema: AsyncResult.Schema({ success: Schema.Number }) })
    )
    const server = AtomRegistry.make()
    const client = AtomRegistry.make()
    try {
      const serverAtom = Atom.make<AsyncResult.AsyncResult<number>>(AsyncResult.success(10)).pipe(
        Atom.serializable({ key: "count", schema: AsyncResult.Schema({ success: Schema.Number }) })
      )
      server.mount(serverAtom)
      Hydration.hydrate(client, Hydration.dehydrate(server))
      client.mount(atom)

      assert.strictEqual(runs, 1)

      client.set(dependency, 2)
      const result = client.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 2)
      assert.strictEqual(runs, 2)
    } finally {
      server.dispose()
      client.dispose()
    }
  })

  it("skipInitialRun keeps a hydrated effect seed until a factory dependency changes", () => {
    const dependency = Atom.make(1)
    let runs = 0
    const atom = Atom.make((get) => {
      const value = get(dependency)
      return Effect.sync(() => {
        runs++
        return value
      })
    }).pipe(
      Atom.serializable({
        key: "count",
        schema: AsyncResult.Schema({ success: Schema.Number }),
        skipInitialRun: true
      })
    )
    const server = AtomRegistry.make()
    const client = AtomRegistry.make()
    try {
      const serverAtom = Atom.make<AsyncResult.AsyncResult<number>>(AsyncResult.success(10)).pipe(
        Atom.serializable({ key: "count", schema: AsyncResult.Schema({ success: Schema.Number }) })
      )
      server.mount(serverAtom)
      Hydration.hydrate(client, Hydration.dehydrate(server))
      client.mount(atom)

      let result = client.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 10)
      assert.strictEqual(runs, 0)

      client.set(dependency, 2)
      result = client.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, 2)
      assert.strictEqual(runs, 1)
    } finally {
      server.dispose()
      client.dispose()
    }
  })

  it("notifies subscribers of an atom the registry already holds", () => {
    const atom = Atom.make(0).pipe(Atom.serializable({ key: "existing-count", schema: Schema.Number }))
    const doubled = Atom.map(atom, (n) => n * 2)
    const registry = AtomRegistry.make()
    try {
      registry.mount(doubled)
      const heard: Array<number> = []
      registry.subscribe(atom, (n) => heard.push(n))

      const state: Array<Hydration.DehydratedAtomValue> = [{
        "~effect/reactivity/Hydration/DehydratedAtom": true,
        key: "existing-count",
        value: 5,
        dehydratedAt: 0
      }]
      Hydration.hydrate(registry, state)

      assert.deepStrictEqual(heard, [5])
      assert.strictEqual(registry.get(doubled), 10)
    } finally {
      registry.dispose()
    }
  })

  it("falls back on the first read of invalid immediate hydration", () => {
    const atom = Atom.make(0).pipe(Atom.serializable({ key: "count", schema: Schema.Number }))
    const registry = AtomRegistry.make()
    try {
      const state: Array<Hydration.DehydratedAtomValue> = [{
        "~effect/reactivity/Hydration/DehydratedAtom": true,
        key: "count",
        value: "invalid",
        dehydratedAt: 0
      }]
      Hydration.hydrate(registry, state)

      assert.strictEqual(registry.get(atom), 0)
    } finally {
      registry.dispose()
    }
  })

  it.each(["invalid", "skipped"] as const)("releases %s streamed hydration", async (kind) => {
    const { promise, resolve } = Promise.withResolvers<number>()
    const serverAtom = Atom.make(Effect.promise(() => promise)).pipe(
      Atom.serializable({
        key: "count",
        schema: AsyncResult.Schema({ success: kind === "invalid" ? Schema.Number : Schema.Int })
      })
    )
    const source = Atom.make(Effect.succeed(0))
    const clientAtom = (kind === "invalid"
      ? source.pipe(Atom.mapResult((n) => n + 1))
      : source.pipe(Atom.withRefresh("1 hour"))).pipe(
        Atom.serializable({ key: "count", schema: AsyncResult.Schema({ success: Schema.Int }) })
      )
    const server = AtomRegistry.make()
    const client = AtomRegistry.make()
    try {
      server.mount(serverAtom)
      const state = Hydration.toValues(Hydration.dehydrate(server, { encodeInitialAs: "promise" }))
      Hydration.hydrate(client, state)
      client.mount(clientAtom)
      assert.deepStrictEqual(client.get(clientAtom), AsyncResult.initial(true))

      resolve(0.5)
      await state[0].resultPromise
      await Effect.runPromise(Effect.yieldNow)

      const result = client.get(clientAtom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value, kind === "invalid" ? 1 : 0)
      assert.strictEqual(result.waiting, false)
    } finally {
      server.dispose()
      client.dispose()
    }
  })

  it("preserves client state when a superseded stream cannot be encoded", async () => {
    const atom = Atom.make<AsyncResult.AsyncResult<number>>(AsyncResult.initial()).pipe(
      Atom.serializable({ key: "count", schema: AsyncResult.Schema({ success: Schema.Int }) })
    )
    const server = AtomRegistry.make()
    const client = AtomRegistry.make()
    try {
      server.mount(atom)
      const state = Hydration.dehydrate(server, { encodeInitialAs: "promise" })
      Hydration.hydrate(client, state)
      const result = AsyncResult.success(42)
      client.set(atom, result)

      server.set(atom, AsyncResult.success(0.5))
      await Hydration.toValues(state)[0].resultPromise

      assert.deepStrictEqual(client.get(atom), result)
    } finally {
      server.dispose()
      client.dispose()
    }
  })

  const atom = Atom.make<AsyncResult.AsyncResult<string>>(AsyncResult.initial()).pipe(
    Atom.serializable({ key: "profile", schema: AsyncResult.Schema({ success: Schema.String }) })
  )

  it.each([
    { serverTimestamp: 1000, expected: "client", expectedTimestamp: 2000 },
    { serverTimestamp: 3000, expected: "server", expectedTimestamp: 3000 }
  ])("compares result freshness on the next read (server timestamp: $serverTimestamp)", ({
    expected,
    expectedTimestamp,
    serverTimestamp
  }) => {
    const server = AtomRegistry.make()
    const client = AtomRegistry.make()
    try {
      server.set(atom, AsyncResult.success("server", { timestamp: serverTimestamp }))
      const state = JSON.parse(JSON.stringify(Hydration.dehydrate(server)))
      client.set(atom, AsyncResult.success("client", { timestamp: 2000 }))

      Hydration.hydrate(client, state)

      assert.deepStrictEqual(client.get(atom), AsyncResult.success(expected, { timestamp: expectedTimestamp }))
    } finally {
      server.dispose()
      client.dispose()
    }
  })

  it("ignores a streamed result older than the client value at resolution", async () => {
    const server = AtomRegistry.make()
    const client = AtomRegistry.make()
    try {
      server.mount(atom)
      const state = Hydration.dehydrate(server, { encodeInitialAs: "promise" })
      Hydration.hydrate(client, state)

      // The client finishes after hydration starts but before the server result arrives.
      client.set(atom, AsyncResult.success("client", { timestamp: 2000 }))
      server.set(atom, AsyncResult.success("server", { timestamp: 1000 }))
      await Hydration.toValues(state)[0].resultPromise

      assert.deepStrictEqual(client.get(atom), AsyncResult.success("client", { timestamp: 2000 }))
    } finally {
      server.dispose()
      client.dispose()
    }
  })
})
