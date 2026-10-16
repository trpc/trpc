import { assertFalse, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import * as Context from "effect/Context"
import * as Equal from "effect/Equal"
import * as Option from "effect/Option"
import * as Redactable from "effect/Redactable"
import { describe, it } from "vitest"

describe("Context", () => {
  const A = Context.Service<number>("ContextTest/A")
  const B = Context.Service<number>("ContextTest/B")
  const C = Context.Service<number>("ContextTest/C")

  it("keeps the source immutable across additions", () => {
    const source = Context.make(A, 1)
    const result = Context.add(source, B, 2)

    deepStrictEqual([...source.mapUnsafe], [[A.key, 1]])
    deepStrictEqual([...result.mapUnsafe], [[A.key, 1], [B.key, 2]])
  })

  it("removes a service with addOrOmit", () => {
    const context = Context.make(A, 1).pipe(Context.addOrOmit(A, Option.none()))

    assertTrue(Context.getOption(context, A)._tag === "None")
  })

  it("preserves Map insertion order for replacements and appends", () => {
    const Ref = Context.Reference<number>("ContextTest/OrderRef", { defaultValue: () => 0 })
    const context = Context.empty().pipe(
      Context.add(A, 1),
      Context.add(Ref, 2),
      Context.add(B, 3),
      Context.add(A, 4),
      Context.add(C, 5)
    )

    deepStrictEqual([...context.mapUnsafe], [
      [A.key, 4],
      [Ref.key, 2],
      [B.key, 3],
      [C.key, 5]
    ])
  })

  it("invalidates the fiber cache only for opted-in keys", () => {
    const Cached = Context.Service<number>("ContextTest/Cached", { fiberCached: true })
    class CachedClass extends Context.Service<CachedClass, number>()("ContextTest/CachedClass", {
      fiberCached: true
    }) {}
    const Ref = Context.Reference<number>("ContextTest/Ref", { defaultValue: () => 0 })
    const CachedRef = Context.Reference<number>("ContextTest/CachedRef", {
      fiberCached: true,
      defaultValue: () => 0
    })

    const source = Context.make(A, 1)
    assertTrue(Context.hasSameCache(source, Context.add(source, B, 1)))
    assertTrue(Context.hasSameCache(source, Context.add(source, Ref, 1)))
    assertFalse(Context.hasSameCache(source, Context.add(source, CachedRef, 1)))
    const context = source.pipe(
      Context.add(Cached, 2),
      Context.add(CachedClass, 3)
    )

    strictEqual(Context.get(context, Cached), 2)
    strictEqual(Context.get(context, CachedClass), 3)
    assertTrue(Context.getOption(source, Cached)._tag === "None")

    const replaced = Context.add(context, Cached, 4)
    strictEqual(Context.get(replaced, Cached), 4)
    strictEqual(Context.get(context, Cached), 2)

    deepStrictEqual([...replaced.mapUnsafe], [
      [A.key, 1],
      [Cached.key, 4],
      [CachedClass.key, 3]
    ])
    deepStrictEqual([...Context.omit(Cached)(replaced).mapUnsafe], [
      [A.key, 1],
      [CachedClass.key, 3]
    ])
  })

  it("supports the Redactable fallback context", () => {
    const Cached = Context.Service<number>("ContextTest/RedactableCached", { fiberCached: true })
    const context = Redactable.getRedacted({
      [Redactable.symbolRedactable](context: Context.Context<never>) {
        return context
      }
    }) as Context.Context<never>

    strictEqual(context.mapUnsafe.size, 0)
    assertTrue(Context.getOption(context, Cached)._tag === "None")

    const added = Context.add(context, Cached, 1)
    strictEqual(Context.get(added, Cached), 1)
    strictEqual(context.mapUnsafe.size, 0)
  })

  it("distinguishes an undefined service from an absent service", () => {
    const Undefined = Context.Service<undefined>("ContextTest/Undefined", { fiberCached: true })
    const Missing = Context.Service<undefined>("ContextTest/Missing")
    const Ref = Context.Reference<string | undefined>("ContextTest/UndefinedRef", {
      defaultValue: () => "default",
      fiberCached: true
    })
    const context = Context.make(Undefined, undefined).pipe(Context.add(Ref, undefined))

    assertTrue(Context.getOption(context, Undefined)._tag === "Some")
    assertTrue(Context.getOption(context, Missing)._tag === "None")
    strictEqual(Context.getUnsafe(context, Undefined), undefined)
    strictEqual(Context.getOrElse(context, Undefined, () => 1), undefined)
    deepStrictEqual(Context.getOption(context, Ref), Option.some(undefined))
    strictEqual(Context.get(context, Ref), undefined)
  })

  it("bounds deep overlay chains without changing values or order", () => {
    const keys = Array.from({ length: 20 }, (_, i) => Context.Service<number>(`ContextTest/Deep${i}`))
    let context = Context.empty()
    for (let i = 0; i < keys.length; i++) {
      context = Context.add(context, keys[i], i)
    }

    strictEqual(context.mapUnsafe.size, 20)
    deepStrictEqual([...context.mapUnsafe.keys()], keys.map((key) => key.key))
    for (let i = 0; i < keys.length; i++) {
      strictEqual(Context.getUnsafe(context, keys[i]), i)
    }
    // Rebasing on ordinary keys must not invalidate fiber caches
    assertTrue(Context.hasSameCache(Context.empty(), context))
  })

  it("flattens after repeated base fall-throughs", () => {
    const context = Context.make(A, 1).pipe(Context.add(B, 2))
    const impl = context as any

    for (let i = 0; i < 7; i++) {
      strictEqual(Context.getUnsafe(context, A), 1)
    }
    strictEqual(impl._flat, undefined)

    strictEqual(Context.getUnsafe(context, A), 1)
    assertTrue(impl._flat instanceof Map)
    strictEqual(impl.overlay, undefined)
    strictEqual(impl.depth, 0)

    const added = Context.add(context, C, 3) as any
    strictEqual(added._flat, undefined)
    strictEqual(added.baseHits, 0)
  })

  it("defers flattening a large base until enough base hits", () => {
    const keys = Array.from({ length: 32 }, (_, i) => Context.Service<number>(`ContextTest/Large${i}`))
    const base = Context.makeUnsafe(new Map(keys.map((key, i) => [key.key, i])))
    const context = Context.add(base, A, -1)
    const impl = context as any

    for (let i = 0; i < 8; i++) {
      strictEqual(Context.getUnsafe(context, keys[0]), 0)
    }
    strictEqual(impl._flat, undefined)
    strictEqual(impl.base, base.mapUnsafe)
    strictEqual(Context.getUnsafe(context, A), -1)
    assertTrue(Option.isNone(Context.getOption(context, B)))
    strictEqual(impl.baseHits, 8)

    for (let i = 8; i < 31; i++) {
      strictEqual(Context.getUnsafe(context, keys[i]), i)
    }
    strictEqual(impl._flat, undefined)
    strictEqual(impl.base, base.mapUnsafe)

    strictEqual(Context.getUnsafe(context, keys[31]), 31)
    assertTrue(impl._flat instanceof Map)
    strictEqual(impl.overlay, undefined)
    strictEqual(impl.baseHits, 32)
    strictEqual(Context.getUnsafe(context, A), -1)
    strictEqual(Context.getUnsafe(context, keys[0]), 0)
  })

  it("supports the ReadonlyMap surface through mapUnsafe", () => {
    const context = Context.make(A, 1).pipe(Context.add(B, 2))
    const visited: Array<[string, number]> = []
    context.mapUnsafe.forEach((value, key) => visited.push([key, value]))

    strictEqual(context.mapUnsafe.size, 2)
    assertTrue(context.mapUnsafe.has(A.key))
    strictEqual(context.mapUnsafe.get(B.key), 2)
    deepStrictEqual([...context.mapUnsafe.keys()], [A.key, B.key])
    deepStrictEqual([...context.mapUnsafe.values()], [1, 2])
    deepStrictEqual([...context.mapUnsafe.entries()], [[A.key, 1], [B.key, 2]])
    deepStrictEqual(visited, [[A.key, 1], [B.key, 2]])
  })

  it("supports equality and JSON materialization", () => {
    const left = Context.make(A, 1).pipe(Context.add(B, 2))
    const right = Context.makeUnsafe(new Map([[A.key, 1], [B.key, 2]]))

    assertTrue(Equal.equals(left, right))
    assertFalse(Equal.equals(left, Context.make(A, 2)))
    deepStrictEqual(left.toJSON(), {
      _id: "Context",
      services: [{ key: A.key, value: 1 }, { key: B.key, value: 2 }]
    })
  })

  it("merges with right bias and preserves empty operand identity", () => {
    const left = Context.make(A, 1).pipe(Context.add(B, 2))
    const right = Context.make(A, 3).pipe(Context.add(C, 4))
    const merged = Context.merge(left, right)

    strictEqual(Context.merge(Context.empty(), left), left)
    strictEqual(Context.merge(left, Context.empty()), left)
    deepStrictEqual([...merged.mapUnsafe], [[A.key, 3], [B.key, 2], [C.key, 4]])
  })

  it("pick and omit retain source ordering", () => {
    const source = Context.make(A, 1).pipe(Context.add(B, 2), Context.add(C, 3))

    deepStrictEqual([...Context.pick(C, A)(source).mapUnsafe], [[A.key, 1], [C.key, 3]])
    deepStrictEqual([...Context.omit(B)(source).mapUnsafe], [[A.key, 1], [C.key, 3]])
  })

  it("resolves reference defaults lazily and caches them", () => {
    let calls = 0
    const Ref = Context.Reference<object>("ContextTest/LazyRef", {
      defaultValue: () => {
        calls++
        return {}
      }
    })
    const context = Context.empty()

    strictEqual(calls, 0)
    const first = Context.get(context, Ref)
    strictEqual(calls, 1)
    strictEqual(Context.get(context, Ref), first)
    strictEqual(calls, 1)
  })

  it("retains the makeUnsafe input map", () => {
    const map = new Map([[A.key, 1]])
    const context = Context.makeUnsafe(map)

    strictEqual(context.mapUnsafe, map)
  })
})
