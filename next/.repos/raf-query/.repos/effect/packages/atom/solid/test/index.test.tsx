import {
  RegistryContext,
  useAtom,
  useAtomInitialValues,
  useAtomRef,
  useAtomRefProp,
  useAtomRefPropValue,
  useAtomResource,
  useAtomValue
} from "@effect/atom-solid"
import { assert, describe, it } from "@effect/vitest"
import { AsyncResult, Atom, AtomRef, AtomRegistry } from "effect/reactivity"
import { type Accessor, createComponent, createEffect, createRoot, type Resource } from "solid-js"

describe("atom-solid", () => {
  describe("useAtomValue", () => {
    it("reads value from simple Atom", () => {
      const atom = Atom.make(42)
      let observed: number | undefined
      const dispose = renderAtomValue(atom, (value) => {
        observed = value
      })
      assert.strictEqual(observed, 42)
      dispose()
    })

    it("reads value with transform function", () => {
      const atom = Atom.make(42)
      let observed: number | undefined
      const dispose = renderAtomValue(atom, (value) => {
        observed = value
      }, { map: (value) => value * 2 })
      assert.strictEqual(observed, 84)
      dispose()
    })

    it("updates when Atom value changes", () => {
      const registry = AtomRegistry.make()
      const atom = Atom.make("initial")
      let observed: string | undefined
      const dispose = renderAtomValue(atom, (value) => {
        observed = value
      }, { registry })
      assert.strictEqual(observed, "initial")
      registry.set(atom, "updated")
      assert.strictEqual(observed, "updated")
      dispose()
    })

    it("works with computed Atom", () => {
      const baseAtom = Atom.make(10)
      const computedAtom = Atom.make((get) => get(baseAtom) * 2)
      let observed: number | undefined
      const dispose = renderAtomValue(computedAtom, (value) => {
        observed = value
      })
      assert.strictEqual(observed, 20)
      dispose()
    })
  })

  describe("useAtom", () => {
    it("updates value with setter", () => {
      const atom = Atom.make(0)
      let observed: number | undefined
      const dispose = createRoot((dispose) => {
        const [value, setValue] = useAtom(() => atom)
        createEffect(() => {
          observed = value()
        })
        createEffect(() => {
          if (value() !== 0) {
            return
          }
          setValue(1)
          setValue((current) => current + 1)
        })
        return dispose
      })
      assert.strictEqual(observed, 2)
      dispose()
    })
  })

  describe("useAtomInitialValues", () => {
    it("applies initial values once per registry", () => {
      const registry = AtomRegistry.make()
      const atom = Atom.make(0)
      createRoot((dispose) => {
        createComponent(RegistryContext.Provider, {
          value: registry,
          get children() {
            useAtomInitialValues([[atom, 1]])
            useAtomInitialValues([[atom, 2]])
            assert.strictEqual(registry.get(atom), 1)
            return null
          }
        })
        return dispose
      })
    })
  })

  describe("AtomRef", () => {
    it("updates when AtomRef changes", () => {
      const ref = AtomRef.make(0)
      let observed: number | undefined
      const dispose = renderAtomRef(ref, (value) => {
        observed = value
      })
      assert.strictEqual(observed, 0)
      ref.set(1)
      assert.strictEqual(observed, 1)
      dispose()
    })

    it("updates when AtomRef prop changes", () => {
      const ref = AtomRef.make({ count: 0, label: "a" })
      const propRef = useAtomRefProp(() => ref, "count")
      let observed: number | undefined
      const dispose = renderAtomRef(propRef(), (value) => {
        observed = value
      })
      assert.strictEqual(observed, 0)
      ref.set({ count: 1, label: "a" })
      assert.strictEqual(observed, 1)
      dispose()
    })

    it("updates when AtomRef prop value changes", () => {
      const ref = AtomRef.make({ count: 0, label: "a" })
      let observed: number | undefined
      const dispose = renderAccessor(() => useAtomRefPropValue(() => ref, "count"), (value) => {
        observed = value
      })
      assert.strictEqual(observed, 0)
      ref.set({ count: 2, label: "a" })
      assert.strictEqual(observed, 2)
      dispose()
    })
  })

  describe("useAtomResource", () => {
    it("suspends on Initial result", () => {
      const atom = Atom.make(AsyncResult.initial<number, Error>())
      const { resource, dispose } = renderAtomResource(() => atom)
      assert.strictEqual(resource.loading, true)
      assert.strictEqual(resource(), undefined)
      dispose()
    })
  })

  //
  //   it("suspends on waiting when suspendOnWaiting is true", () => {
  //     const atom = Atom.make(AsyncResult.success(1, { waiting: true }))
  //     const { resource, dispose } = renderAtomResource(atom, { suspendOnWaiting: true })
  //     assert.strictEqual(resource.loading, true)
  //     assert.strictEqual(resource(), undefined)
  //     dispose()
  //   })
  //
  //   it("returns success value by default", async () => {
  //     const atom = Atom.make(AsyncResult.success(5, { waiting: true }))
  //     const { resource, dispose } = renderAtomResource(atom)
  //     await Promise.resolve()
  //     await Promise.resolve()
  //     assert.strictEqual(resource.loading, false)
  //     assert.strictEqual(resource(), 5)
  //     dispose()
  //   })
  //
  //   it("surfaces failure via Cause.squash", async () => {
  //     const error = new Error("boom")
  //     const atom = Atom.make(AsyncResult.fail(error))
  //     let resource: ReturnType<typeof useAtomResource>[0] | undefined
  //     let caught: unknown
  //     const dispose = createRoot((dispose) => {
  //       catchError(() => {
  //         ;[resource] = useAtomResource(atom)
  //         createEffect(() => {
  //           resource?.()
  //         })
  //       }, (err) => {
  //         caught = err
  //       })
  //       return dispose
  //     })
  //     await Promise.resolve()
  //     await Promise.resolve()
  //     assert.ok(caught instanceof Error)
  //     assert.strictEqual(caught.message, "boom")
  //     assert.strictEqual(resource?.error, caught)
  //     assert.strictEqual(resource?.loading, false)
  //     dispose()
  //   })
  //
  //   it("preserves success result when preserveResult is true", async () => {
  //     const atom = Atom.make(Effect.succeed(7))
  //     const { resource, dispose } = renderAtomResource(atom, { preserveResult: true })
  //     await Promise.resolve()
  //     await Promise.resolve()
  //     const result = resource()!
  //     assert.strictEqual(AsyncResult.isSuccess(result), true)
  //     if (AsyncResult.isSuccess(result)) {
  //       assert.strictEqual(result.value, 7)
  //     }
  //     assert.strictEqual(resource.error, undefined)
  //     dispose()
  //   })
  //
  //   it("preserves failure result when preserveResult is true", async () => {
  //     const error = new Error("failure")
  //     const atom = Atom.make(Effect.fail(error))
  //     const { resource, dispose } = renderAtomResource(atom, { preserveResult: true })
  //     await Promise.resolve()
  //     await Promise.resolve()
  //     const result = resource()!
  //     assert.strictEqual(AsyncResult.isFailure(result), true)
  //     if (AsyncResult.isFailure(result)) {
  //       const squashed = Cause.squash(result.cause)
  //       assert.ok(squashed instanceof Error)
  //       assert.strictEqual(squashed.message, "failure")
  //     }
  //     assert.strictEqual(resource.error, undefined)
  //     dispose()
  //   })
  // })
})

const renderAtomRef = function<A>(ref: AtomRef.ReadonlyRef<A>, onValue: (_: A) => void) {
  return createRoot((dispose) => {
    const accessor = useAtomRef(() => ref)
    createEffect(() => {
      onValue(accessor())
    })
    return dispose
  })
}

const renderAccessor = function<A>(makeAccessor: () => Accessor<A>, onValue: (_: A) => void) {
  return createRoot((dispose) => {
    const accessor = makeAccessor()
    createEffect(() => {
      onValue(accessor())
    })
    return dispose
  })
}

const renderAtomValue = function<A, B = A>(
  atom: Atom.Atom<A>,
  onValue: (_: B) => void,
  options?: { readonly registry?: AtomRegistry.AtomRegistry; readonly map?: (_: A) => B }
) {
  return createRoot((dispose) => {
    const run = () => {
      const accessor = options?.map ? useAtomValue(() => atom, options.map) : useAtomValue(() => atom)
      createEffect(() => {
        onValue(accessor() as B)
      })
      return null
    }

    if (options?.registry) {
      createComponent(RegistryContext.Provider, {
        value: options.registry,
        get children() {
          return run()
        }
      })
    } else {
      run()
    }

    return dispose
  })
}

const renderAtomResource = function<A, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }
) {
  let resource:
    | Resource<A>
    | undefined
  const dispose = createRoot((dispose) => {
    ;[resource] = useAtomResource(atom, options)
    createEffect(() => {
      resource?.()
    })
    return dispose
  })
  return { resource: resource!, dispose }
}
