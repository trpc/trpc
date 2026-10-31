// <reference types="@testing-library/jest-dom" />
import { assert } from "@effect/vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { Cause, Context, Effect, Latch, Layer } from "effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRef from "effect/reactivity/AtomRef"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Hydration from "effect/reactivity/Hydration"
import * as Schema from "effect/Schema"
import * as React from "react"
import { Suspense } from "react"
import * as ReactDOMClient from "react-dom/client"
import { renderToString } from "react-dom/server"
import { ErrorBoundary } from "react-error-boundary"
import { beforeEach, describe, expect, it, test, vi } from "vitest"
import {
  HydrationBoundary,
  RegistryContext,
  RegistryProvider,
  useAtomRef,
  useAtomSuspense,
  useAtomValue
} from "../src/index.ts"
import * as ScopedAtom from "../src/ScopedAtom.ts"

// Tests share the DOM and registry.
describe("atom-react", { concurrent: false }, () => {
  let registry: AtomRegistry.AtomRegistry

  beforeEach(() => {
    registry = AtomRegistry.make()
  })

  describe("runtime", () => {
    test("can inject test layers", () => {
      class TheNumber extends Context.Service<TheNumber>()("TheNumber", {
        make: Effect.succeed({ n: 42 as number })
      }) {
        static readonly layer = Layer.effect(this, this.make)
      }
      const runtime = Atom.runtime(TheNumber.layer)
      const numberAtom = runtime.atom(TheNumber.use((_) => Effect.succeed(_.n)))

      function TestComponent() {
        const value = useAtomValue(numberAtom, AsyncResult.getOrThrow)
        return <div data-testid="value">{value}</div>
      }

      render(
        <RegistryProvider
          initialValues={[
            Atom.initialValue(
              runtime.layer,
              Layer.succeed(TheNumber, { n: 69 })
            )
          ]}
        >
          <TestComponent />
        </RegistryProvider>
      )

      expect(screen.getByTestId("value")).toHaveTextContent("69")
    })
  })

  describe("useAtomValue", () => {
    test("should read value from simple Atom", () => {
      const atom = Atom.make(42)

      function TestComponent() {
        const value = useAtomValue(atom)
        return <div data-testid="value">{value}</div>
      }

      render(<TestComponent />)

      expect(screen.getByTestId("value")).toHaveTextContent("42")
    })

    test("should read value with transform function", () => {
      const atom = Atom.make(42)

      function TestComponent() {
        const value = useAtomValue(atom, (x) => x * 2)
        return <div data-testid="value">{value}</div>
      }

      render(<TestComponent />)

      expect(screen.getByTestId("value")).toHaveTextContent("84")
    })

    test("should update when Atom value changes", async () => {
      const atom = Atom.make("initial")

      function TestComponent() {
        const value = useAtomValue(atom)
        return <div data-testid="value">{value}</div>
      }

      render(
        <RegistryContext.Provider value={registry}>
          <TestComponent />
        </RegistryContext.Provider>
      )

      expect(screen.getByTestId("value")).toHaveTextContent("initial")

      act(() => {
        registry.set(atom, "updated")
      })

      await waitFor(() => {
        expect(screen.getByTestId("value")).toHaveTextContent("updated")
      })
    })

    test("should work with computed Atom", () => {
      const baseAtom = Atom.make(10)
      const computedAtom = Atom.make((get) => get(baseAtom) * 2)

      function TestComponent() {
        const value = useAtomValue(computedAtom)
        return <div data-testid="value">{value}</div>
      }

      render(<TestComponent />)

      expect(screen.getByTestId("value")).toHaveTextContent("20")
    })

    test("initializing an atom that sets another atom does not update other components during render", () => {
      const count = Atom.make(0)
      const resource = Atom.make((get) =>
        Effect.sync(() => {
          get.set(count, 1)
          return "ready"
        })
      )
      const errors = vi.spyOn(console, "error").mockImplementation(() => {})

      function Observer() {
        return <div data-testid="count">{useAtomValue(count)}</div>
      }
      function Initializer() {
        const result = useAtomValue(resource)
        return <div data-testid="resource">{AsyncResult.getOrElse(result, () => "")}</div>
      }

      try {
        const { rerender } = render(
          <RegistryContext.Provider value={registry}>
            <Observer />
          </RegistryContext.Provider>
        )
        assert.strictEqual(screen.getByTestId("count").textContent, "0")

        rerender(
          <RegistryContext.Provider value={registry}>
            <Observer />
            <Initializer />
          </RegistryContext.Provider>
        )

        assert.strictEqual(screen.getByTestId("count").textContent, "1")
        assert.strictEqual(screen.getByTestId("resource").textContent, "ready")
        assert.deepStrictEqual(errors.mock.calls, [])
      } finally {
        errors.mockRestore()
      }
    })

    test("suspense success", () => {
      const atom = Atom.make(Effect.never)

      function TestComponent() {
        const value = useAtomSuspense(atom).value
        return <div data-testid="value">{value}</div>
      }

      render(
        <Suspense fallback={<div data-testid="loading">Loading...</div>}>
          <TestComponent />
        </Suspense>
      )

      expect(screen.getByTestId("loading")).toBeInTheDocument()
    })

    test("suspense subscriptions are isolated per registry", async () => {
      const atom = Atom.make(AsyncResult.initial<string>())
      const firstRegistry = AtomRegistry.make()
      const secondRegistry = AtomRegistry.make()

      function TestComponent({ id }: { readonly id: string }) {
        const value = useAtomSuspense(atom).value
        return <div data-testid={`${id}-value`}>{value}</div>
      }

      render(
        <RegistryContext.Provider value={firstRegistry}>
          <Suspense fallback={<div data-testid="first-loading">Loading...</div>}>
            <TestComponent id="first" />
          </Suspense>
        </RegistryContext.Provider>
      )
      render(
        <RegistryContext.Provider value={secondRegistry}>
          <Suspense fallback={<div data-testid="second-loading">Loading...</div>}>
            <TestComponent id="second" />
          </Suspense>
        </RegistryContext.Provider>
      )

      act(() => {
        secondRegistry.set(atom, AsyncResult.success("second"))
      })

      await waitFor(() => {
        expect(screen.getByTestId("second-value")).toHaveTextContent("second")
      })
      expect(screen.getByTestId("first-loading")).toBeInTheDocument()

      act(() => {
        firstRegistry.set(atom, AsyncResult.success("first"))
      })

      await waitFor(() => {
        expect(screen.getByTestId("first-value")).toHaveTextContent("first")
      })
    })
  })

  test("useAtomRef updates after switching refs", () => {
    const first = AtomRef.make(0)
    const second = AtomRef.make(1)

    function TestComponent({ source }: { readonly source: AtomRef.ReadonlyRef<number> }) {
      return <div data-testid="value">{useAtomRef(source)}</div>
    }

    const { rerender } = render(<TestComponent source={first} />)
    rerender(<TestComponent source={second} />)

    act(() => {
      second.set(0)
    })

    expect(screen.getByTestId("value")).toHaveTextContent("0")
  })

  describe("ScopedAtom", () => {
    test("throws when used outside Provider", () => {
      const counter = ScopedAtom.make(() => Atom.make(0))

      function TestComponent() {
        counter.use()
        return <div>ok</div>
      }

      expect(() => render(<TestComponent />)).toThrow("ScopedAtom used outside of its Provider")
    })

    test("scopes atom instances per Provider", async () => {
      const counter = ScopedAtom.make(() => Atom.make(0))

      function Count() {
        const atom = counter.use()
        const value = useAtomValue(atom)
        return <div data-testid="value">{value}</div>
      }

      function SetTo({ value }: { readonly value: number }) {
        const atom = counter.use()
        const registry = React.useContext(RegistryContext)
        React.useEffect(() => {
          registry.set(atom, value)
        }, [registry, atom, value])
        return null
      }

      render(
        <div>
          <counter.Provider>
            <SetTo value={1} />
            <Count />
          </counter.Provider>
          <counter.Provider>
            <SetTo value={2} />
            <Count />
          </counter.Provider>
        </div>
      )

      await waitFor(() => {
        const values = screen.getAllByTestId("value")
        expect(values[0]).toHaveTextContent("1")
        expect(values[1]).toHaveTextContent("2")
      })
    })

    test("input factory uses provider value once", () => {
      const makeAtom = vi.fn((value: number) => Atom.make(value))
      const scoped = ScopedAtom.make(makeAtom)

      function Count() {
        const atom = scoped.use()
        const value = useAtomValue(atom)
        return <div data-testid="value">{value}</div>
      }

      const { rerender } = render(
        <scoped.Provider value={10}>
          <Count />
        </scoped.Provider>
      )

      expect(screen.getByTestId("value")).toHaveTextContent("10")
      expect(makeAtom).toHaveBeenCalledTimes(1)
      expect(makeAtom).toHaveBeenCalledWith(10)

      rerender(
        <scoped.Provider value={99}>
          <Count />
        </scoped.Provider>
      )

      expect(screen.getByTestId("value")).toHaveTextContent("10")
      expect(makeAtom).toHaveBeenCalledTimes(1)
    })

    test("integrates with useAtomValue", async () => {
      const scoped = ScopedAtom.make(() => Atom.make(0))

      function Counter() {
        const atom = scoped.use()
        const value = useAtomValue(atom)
        return <div data-testid="value">{value}</div>
      }

      function IncrementOnce() {
        const atom = scoped.use()
        const registry = React.useContext(RegistryContext)
        React.useEffect(() => {
          registry.set(atom, 1)
        }, [registry, atom])
        return null
      }

      render(
        <scoped.Provider>
          <IncrementOnce />
          <Counter />
        </scoped.Provider>
      )

      await waitFor(() => {
        expect(screen.getByTestId("value")).toHaveTextContent("1")
      })
    })
  })

  test("suspense error", () => {
    const atom = Atom.make(Effect.fail(new Error("test")))
    function TestComponent() {
      const value = useAtomSuspense(atom).value
      return <div data-testid="value">{value}</div>
    }

    render(
      <ErrorBoundary fallback={<div data-testid="error">Error</div>}>
        <Suspense fallback={<div data-testid="loading">Loading...</div>}>
          <TestComponent />
        </Suspense>
      </ErrorBoundary>,
      {
        onCaughtError: ((error: unknown) => {
          if (error instanceof Error && error.message === "test") {
            return
          }
          // eslint-disable-next-line no-console
          console.error(error)
        }) as unknown as undefined // todo: fix idk why the types are weird
      }
    )

    expect(screen.getByTestId("error")).toBeInTheDocument()
  })

  describe("hydration", () => {
    test("basic hydration with number atom and result atoms", () => {
      const atomBasic = Atom.make(0).pipe(
        Atom.serializable({
          key: "basic",
          schema: Schema.Number
        })
      )
      const e: Effect.Effect<number, string> = Effect.never
      const makeAtomResult = (key: string) =>
        Atom.make(e).pipe(
          Atom.serializable({
            key,
            schema: AsyncResult.Schema({
              success: Schema.Number,
              error: Schema.String
            })
          })
        )

      const atomResult1 = makeAtomResult("success")
      const atomResult2 = makeAtomResult("errored")
      const atomResult3 = makeAtomResult("pending")

      // Use a server-side registry to generate properly encoded dehydrated state
      const serverRegistry = AtomRegistry.make()
      serverRegistry.mount(atomBasic)
      serverRegistry.set(atomBasic, 1)
      serverRegistry.mount(atomResult1)
      ;(serverRegistry.getNodes().get("success") as any).setValue(
        AsyncResult.success(123)
      )
      serverRegistry.mount(atomResult2)
      ;(serverRegistry.getNodes().get("errored") as any).setValue(
        AsyncResult.failure(Cause.fail("error"))
      )
      serverRegistry.mount(atomResult3)
      // atomResult3 stays Initial (just mounted, effect is Effect.never)

      const dehydratedState = Hydration.dehydrate(serverRegistry, {
        encodeInitialAs: "value-only"
      })

      function Basic() {
        const value = useAtomValue(atomBasic)
        return <div data-testid="hydration-basic-value">{value}</div>
      }

      function Result1() {
        const value = useAtomValue(atomResult1)
        return AsyncResult.match(value, {
          onSuccess: (result) => <div data-testid="value-1">{result.value}</div>,
          onFailure: () => <div data-testid="error-1">Error</div>,
          onInitial: () => <div data-testid="loading-1">Loading...</div>
        })
      }

      function Result2() {
        const value = useAtomValue(atomResult2)
        return AsyncResult.match(value, {
          onSuccess: (result) => <div data-testid="value-2">{result.value}</div>,
          onFailure: () => <div data-testid="error-2">Error</div>,
          onInitial: () => <div data-testid="loading-2">Loading...</div>
        })
      }

      function Result3() {
        const value = useAtomValue(atomResult3)
        return AsyncResult.match(value, {
          onSuccess: (result) => <div data-testid="value-3">{result.value}</div>,
          onFailure: () => <div data-testid="error-3">Error</div>,
          onInitial: () => <div data-testid="loading-3">Loading...</div>
        })
      }

      render(
        <RegistryContext.Provider value={AtomRegistry.make()}>
          <HydrationBoundary state={dehydratedState}>
            <Basic />
            <Result1 />
            <Result2 />
            <Result3 />
          </HydrationBoundary>
        </RegistryContext.Provider>
      )

      expect(screen.getByTestId("hydration-basic-value")).toHaveTextContent("1")
      expect(screen.getByTestId("value-1")).toHaveTextContent("123")
      expect(screen.getByTestId("error-2")).toBeInTheDocument()
      expect(screen.getByTestId("loading-3")).toBeInTheDocument()
    })

    test("hydration streaming with resultPromise", async () => {
      const latch = Latch.makeUnsafe()
      let start = 0
      let stop = 0
      const atom = Atom.make(
        Effect.gen(function*() {
          start = start + 1
          yield* latch.await
          stop = stop + 1
          return 1
        })
      ).pipe(
        Atom.serializable({
          key: "test",
          schema: AsyncResult.Schema({
            success: Schema.Number
          })
        })
      )

      registry.mount(atom)

      expect(start).toBe(1)
      expect(stop).toBe(0)

      const dehydratedState = Hydration.dehydrate(registry, {
        encodeInitialAs: "promise"
      })

      function TestComponent() {
        const value = useAtomValue(atom)
        return <div data-testid="value">{value._tag}</div>
      }

      render(
        // provide a fresh registry each time to simulate hydration
        <RegistryContext.Provider value={AtomRegistry.make()}>
          <HydrationBoundary state={dehydratedState}>
            <TestComponent />
          </HydrationBoundary>
        </RegistryContext.Provider>
      )

      expect(screen.getByTestId("value")).toHaveTextContent("Initial")
      // Hydration starts a client effect while the server effect is still pending.
      expect(start).toBe(2)
      expect(stop).toBe(0)

      act(() => {
        Effect.runSync(latch.open)
      })
      await Effect.runPromise(latch.await)

      const result = registry.get(atom)
      expect(result._tag).toBe("Success")
      if (result._tag === "Success") {
        expect(result.value).toBe(1)
      }

      expect(screen.getByTestId("value")).toHaveTextContent("Success")
      expect(start).toBe(2)
      expect(stop).toBe(2)
    })

    test("HydrationBoundary updates existing readers after commit", () => {
      const count = Atom.make(0).pipe(
        Atom.serializable({ key: "existing-count", schema: Schema.Number })
      )
      const server = AtomRegistry.make()
      try {
        server.set(count, 5)
        const state = Hydration.dehydrate(server)

        function Count({ id }: { id: string }) {
          return <div data-testid={id}>{useAtomValue(count)}</div>
        }

        const { rerender } = render(
          <RegistryContext.Provider value={registry}>
            <Count id="header" />
          </RegistryContext.Provider>
        )
        assert.strictEqual(screen.getByTestId("header").textContent, "0")

        rerender(
          <RegistryContext.Provider value={registry}>
            <Count id="header" />
            <HydrationBoundary state={state}>
              <Count id="page" />
            </HydrationBoundary>
          </RegistryContext.Provider>
        )

        assert.strictEqual(screen.getByTestId("header").textContent, "5")
        assert.strictEqual(screen.getByTestId("page").textContent, "5")
      } finally {
        server.dispose()
      }
    })

    test("HydrationBoundary splits new vs existing atoms", () => {
      const newAtom = Atom.make(0).pipe(
        Atom.serializable({ key: "new-atom", schema: Schema.Number })
      )

      // Use a server registry to generate dehydrated state
      const serverRegistry = AtomRegistry.make()
      serverRegistry.mount(newAtom)
      serverRegistry.set(newAtom, 99)
      const dehydratedState = Hydration.dehydrate(serverRegistry)

      function NewValue() {
        const value = useAtomValue(newAtom)
        return <div data-testid="new">{value}</div>
      }

      // Render with a fresh client registry (no pre-existing atoms)
      render(
        <RegistryContext.Provider value={AtomRegistry.make()}>
          <HydrationBoundary state={dehydratedState}>
            <NewValue />
          </HydrationBoundary>
        </RegistryContext.Provider>
      )

      // New atom should be hydrated immediately during render
      expect(screen.getByTestId("new")).toHaveTextContent("99")
    })

    test("dehydrate with encodeInitialAs ignore (default)", () => {
      const atom = Atom.make(Effect.never as Effect.Effect<number>).pipe(
        Atom.serializable({
          key: "initial-atom",
          schema: AsyncResult.Schema({ success: Schema.Number })
        })
      )

      registry.mount(atom)

      // Default behavior: Initial values should be ignored
      const state = Hydration.dehydrate(registry)
      const values = Hydration.toValues(state)

      expect(values.length).toBe(0)
    })

    test("dehydrate with encodeInitialAs value-only", () => {
      const atom = Atom.make(Effect.never as Effect.Effect<number>).pipe(
        Atom.serializable({
          key: "initial-atom",
          schema: AsyncResult.Schema({ success: Schema.Number })
        })
      )

      registry.mount(atom)

      // value-only: should encode the Initial value without a resultPromise
      const state = Hydration.dehydrate(registry, {
        encodeInitialAs: "value-only"
      })
      const values = Hydration.toValues(state)

      expect(values.length).toBe(1)
      expect(values[0].key).toBe("initial-atom")
      expect(values[0].resultPromise).toBeUndefined()
    })

    test("serializable encode/decode survives JSON roundtrip (wire transfer)", () => {
      const atom = Atom.make(0 as never).pipe(
        Atom.serializable({
          key: "wire-test",
          schema: AsyncResult.Schema({
            success: Schema.Struct({ name: Schema.String }),
            error: Schema.String
          })
        })
      )

      const original = AsyncResult.success({ name: "hello" })

      // Encode using the atom's serializable encode
      const encoded = atom[Atom.SerializableTypeId].encode(original)

      // Simulate wire transfer (seroval / JSON serialization roundtrip)
      const wireTransferred = JSON.parse(JSON.stringify(encoded))

      // Decode after wire transfer — this was the bug: decode would fail
      // because the encoded value lost its AsyncResult prototype
      const decoded = atom[Atom.SerializableTypeId].decode(wireTransferred)

      expect(AsyncResult.isAsyncResult(decoded)).toBe(true)
      expect(decoded._tag).toBe("Success")
      if (AsyncResult.isSuccess(decoded)) {
        expect(decoded.value).toEqual({ name: "hello" })
      }
    })

    test("dehydrate + JSON roundtrip + hydrate works (SSR simulation)", () => {
      const atom = Atom.make(Effect.never as Effect.Effect<number>).pipe(
        Atom.serializable({
          key: "ssr-wire",
          schema: AsyncResult.Schema({ success: Schema.Number })
        })
      )

      // Server: dehydrate
      const serverRegistry = AtomRegistry.make()
      serverRegistry.mount(atom)
      ;(serverRegistry.getNodes().get("ssr-wire") as any).setValue(
        AsyncResult.success(42)
      )
      const dehydratedState = Hydration.dehydrate(serverRegistry)

      // Simulate wire transfer (seroval / JSON)
      const wireTransferred = JSON.parse(JSON.stringify(dehydratedState))

      // Client: hydrate from wire-transferred state
      function TestComponent() {
        const value = useAtomValue(atom)
        return (
          <div data-testid="ssr-wire-value">
            {AsyncResult.isSuccess(value) ? value.value : "not-success"}
          </div>
        )
      }

      render(
        <RegistryContext.Provider value={AtomRegistry.make()}>
          <HydrationBoundary state={wireTransferred}>
            <TestComponent />
          </HydrationBoundary>
        </RegistryContext.Provider>
      )

      expect(screen.getByTestId("ssr-wire-value")).toHaveTextContent("42")
    })

    test("empty state is a no-op", () => {
      function TestComponent() {
        return <div data-testid="hydration-empty-state">OK</div>
      }

      render(
        <HydrationBoundary state={[]}>
          <TestComponent />
        </HydrationBoundary>
      )

      expect(screen.getByTestId("hydration-empty-state")).toHaveTextContent("OK")
    })

    test("hydrate with no state is a no-op", () => {
      function TestComponent() {
        return <div data-testid="hydration-no-state">OK</div>
      }

      render(
        <HydrationBoundary>
          <TestComponent />
        </HydrationBoundary>
      )

      expect(screen.getByTestId("hydration-no-state")).toHaveTextContent("OK")
    })
  })

  describe("SSR", () => {
    it("should run atom's during SSR by default", () => {
      const getCount = vi.fn(() => 0)
      const counterAtom = Atom.make(getCount)

      function TestComponent() {
        const count = useAtomValue(counterAtom)
        return <div>{count}</div>
      }

      function App() {
        return <TestComponent />
      }

      const ssrHtml = renderToString(<App />)

      expect(getCount).toHaveBeenCalled()
      expect(ssrHtml).toContain("0")

      render(<App />)

      expect(getCount).toHaveBeenCalled()
      expect(screen.getByText("0")).toBeInTheDocument()
    })

    it("hydrates a delayed Suspense boundary after the atom changes", async () => {
      const userAtom = Atom.make("loading")

      // Reading through a selector also covers the selector's server snapshot.
      // It is inline and returns a new object, so its result must be memoized.
      function Name({ id }: { id: string }) {
        const user = useAtomValue(userAtom, (name) => ({ name: name.toUpperCase() }))
        return <span id={id}>{user.name}</span>
      }

      const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>

      function App({ Panel }: { Panel: React.ComponentType<{ children?: React.ReactNode }> }) {
        return (
          <div>
            <Name id="header" />
            <Suspense fallback={<span>...</span>}>
              <Panel>
                <Name id="panel" />
              </Panel>
            </Suspense>
          </div>
        )
      }

      const container = document.createElement("div")
      container.innerHTML = renderToString(
        <RegistryContext.Provider value={AtomRegistry.make()}>
          <App Panel={Passthrough} />
        </RegistryContext.Provider>
      )
      document.body.append(container)

      // The panel stays dehydrated until its lazy chunk loads.
      let loadPanel!: (mod: { default: typeof Passthrough }) => void
      const LazyPanel = React.lazy(() =>
        new Promise<{ default: typeof Passthrough }>((resolve) => {
          loadPanel = resolve
        })
      )
      const recoverableErrors: Array<unknown> = []

      let root!: ReactDOMClient.Root
      await act(async () => {
        root = ReactDOMClient.hydrateRoot(
          container,
          <RegistryContext.Provider value={registry}>
            <App Panel={LazyPanel} />
          </RegistryContext.Provider>,
          { onRecoverableError: (error) => recoverableErrors.push(error) }
        )
      })
      await act(async () => {
        registry.set(userAtom, "Alice")
      })
      await act(async () => {
        loadPanel({ default: Passthrough })
      })

      expect(recoverableErrors).toEqual([])
      expect(container.innerHTML).toBe(
        `<div><span id="header">ALICE</span><!--$--><span id="panel">ALICE</span><!--/$--></div>`
      )

      act(() => root.unmount())
      container.remove()
    })

    it("keeps the hydrated value until the last reader unmounts", async () => {
      const userAtom = Atom.make("loading").pipe(Atom.keepAlive)

      function Name() {
        return <span>{useAtomValue(userAtom)}</span>
      }

      const app = (
        <RegistryContext.Provider value={registry}>
          <Name />
        </RegistryContext.Provider>
      )
      const html = renderToString(app)
      const containers = [0, 1, 2].map(() => {
        const container = document.createElement("div")
        container.innerHTML = html
        document.body.append(container)
        return container
      })
      const recoverableErrors: Array<unknown> = []
      const hydrate = (container: HTMLElement) =>
        ReactDOMClient.hydrateRoot(container, app, {
          onRecoverableError: (error) => recoverableErrors.push(error)
        })

      let first!: ReactDOMClient.Root
      let second!: ReactDOMClient.Root
      await act(async () => {
        first = hydrate(containers[0])
        second = hydrate(containers[1])
      })
      await act(async () => {
        registry.set(userAtom, "Alice")
      })

      // The second reader keeps the snapshot locked after the first unmounts.
      act(() => first.unmount())
      let third!: ReactDOMClient.Root
      await act(async () => {
        third = hydrate(containers[2])
      })

      expect(recoverableErrors).toEqual([])
      expect(containers[2].innerHTML).toBe("<span>Alice</span>")

      // Once no reader is subscribed, server renders read the registry again.
      act(() => {
        second.unmount()
        third.unmount()
      })
      containers.forEach((container) => container.remove())

      expect(renderToString(app)).toBe("<span>Alice</span>")
    })
  })

  it("should not execute Atom effects during SSR when using withServerSnapshot", () => {
    const mockFetchData = vi.fn(() => 0)

    const userDataAtom = Atom.make(Effect.sync(() => mockFetchData())).pipe(
      Atom.withServerValueInitial
    )

    function TestComponent() {
      const result = useAtomValue(userDataAtom)

      return <div>{result._tag}</div>
    }

    function App() {
      return <TestComponent />
    }

    const ssrHtml = renderToString(<App />)

    expect(mockFetchData).not.toHaveBeenCalled()
    expect(ssrHtml).toContain("Initial")

    render(<App />)

    expect(mockFetchData).toHaveBeenCalled()
    expect(screen.getByText("Success")).toBeInTheDocument()
  })
})
