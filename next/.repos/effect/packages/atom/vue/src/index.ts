/**
 * Vue composables for reading and writing Effect atoms with an injected registry.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import type * as AtomRef from "effect/reactivity/AtomRef"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { computed, type ComputedRef, inject, type InjectionKey, type Ref, shallowRef, watchEffect } from "vue"

/**
 * Re-exports the atom registry API.
 *
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export * as AtomRegistry from "effect/reactivity/AtomRegistry"

/**
 * Re-exports the asynchronous atom result API.
 *
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export * as AsyncResult from "effect/reactivity/AsyncResult"

/**
 * Re-exports the atom API.
 *
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export * as Atom from "effect/reactivity/Atom"

/**
 * Re-exports the atom reference API.
 *
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export * as AtomRef from "effect/reactivity/AtomRef"

/**
 * Re-exports the HTTP API atom helpers.
 *
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export * as AtomHttpApi from "effect/reactivity/AtomHttpApi"

/**
 * Re-exports the RPC atom helpers.
 *
 * @stability unstable
 * @category re-exports
 * @since 4.0.0
 */
export * as AtomRpc from "effect/reactivity/AtomRpc"

/**
 * Vue injection key for an atom registry.
 *
 * @stability unstable
 * @category symbols
 * @since 4.0.0
 */
export const registryKey = Symbol.for("@effect/atom-vue/registryKey") as InjectionKey<AtomRegistry.AtomRegistry>

/**
 * Fallback atom registry used when no registry is provided.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const defaultRegistry: AtomRegistry.AtomRegistry = AtomRegistry.make()

/**
 * Returns the injected atom registry, falling back to the default registry.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const injectRegistry = (): AtomRegistry.AtomRegistry => {
  return inject(registryKey, defaultRegistry)
}

const useAtomValueRef = <A extends Atom.Atom<any>>(atom: () => A) => {
  const registry = injectRegistry()
  const atomRef = computed(atom)
  const value = shallowRef(undefined as any as A)
  watchEffect((onCleanup) => {
    onCleanup(registry.subscribe(atomRef.value, (nextValue: Atom.Type<A>) => {
      value.value = nextValue
    }, { immediate: true }))
  })
  return [value as Readonly<Ref<Atom.Type<A>>>, atomRef, registry] as const
}

/**
 * Returns a reactive atom value and a setter with the requested write mode.
 *
 * **Gotchas**
 *
 * In `promise` and `promiseExit` modes, the setter observes the atom's next
 * settled result, not a result correlated with that write. Overlapping writes
 * can resolve with another write's result. Serialize writes when each caller
 * needs its own result.
 *
 * @stability unstable
 * @category composables
 * @since 4.0.0
 */
export const useAtom = <R, W, Mode extends "value" | "promise" | "promiseExit" = never>(
  atom: () => Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined
  }
): readonly [
  Readonly<Ref<R>>,
  write: "promise" extends Mode ? (
      (value: W) => Promise<AsyncResult.AsyncResult.Success<R>>
    ) :
    "promiseExit" extends Mode ? (
        (value: W) => Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
      ) :
    ((value: W | ((value: R) => W)) => void)
] => {
  const [value, atomRef, registry] = useAtomValueRef(atom)
  return [value as Readonly<Ref<R>>, setAtom(registry, atomRef, options)]
}

/**
 * Returns a read-only Vue ref that tracks an atom value.
 *
 * @stability unstable
 * @category composables
 * @since 4.0.0
 */
export const useAtomValue = <A>(atom: () => Atom.Atom<A>): Readonly<Ref<A>> => useAtomValueRef(atom)[0]

const flattenExit = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}

function setAtom<R, W, Mode extends "value" | "promise" | "promiseExit" = never>(
  registry: AtomRegistry.AtomRegistry,
  atomRef: ComputedRef<Atom.Writable<R, W>>,
  options?: {
    readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined
  }
): "promise" extends Mode ? (
    (
      value: W,
      options?: {
        readonly signal?: AbortSignal | undefined
      } | undefined
    ) => Promise<AsyncResult.AsyncResult.Success<R>>
  ) :
  "promiseExit" extends Mode ? (
      (
        value: W,
        options?: {
          readonly signal?: AbortSignal | undefined
        } | undefined
      ) => Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
    ) :
  ((value: W | ((value: R) => W)) => void)
{
  if (options?.mode === "promise" || options?.mode === "promiseExit") {
    return ((value: W, opts?: any) => {
      registry.set(atomRef.value, value)
      const promise = Effect.runPromiseExit(
        AtomRegistry.getResult(
          registry,
          atomRef.value as Atom.Atom<AsyncResult.AsyncResult<any, any>>,
          { suspendOnWaiting: true }
        ),
        opts
      )
      return options!.mode === "promise" ? promise.then(flattenExit) : promise
    }) as any
  }
  return ((value: W | ((value: R) => W)) => {
    registry.set(atomRef.value, typeof value === "function" ? (value as any)(registry.get(atomRef.value)) : value)
  }) as any
}

/**
 * Returns a setter for an atom, mounting it for the lifetime of the composable.
 *
 * **Gotchas**
 *
 * In `promise` and `promiseExit` modes, the setter observes the atom's next
 * settled result, not a result correlated with that write. Overlapping writes
 * can resolve with another write's result. Serialize writes when each caller
 * needs its own result.
 *
 * @stability unstable
 * @category composables
 * @since 4.0.0
 */
export const useAtomSet = <
  R,
  W,
  Mode extends "value" | "promise" | "promiseExit" = never
>(
  atom: () => Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined
  }
): "promise" extends Mode ? (
    (
      value: W,
      options?: {
        readonly signal?: AbortSignal | undefined
      } | undefined
    ) => Promise<AsyncResult.AsyncResult.Success<R>>
  ) :
  "promiseExit" extends Mode ? (
      (
        value: W,
        options?: {
          readonly signal?: AbortSignal | undefined
        } | undefined
      ) => Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
    ) :
  ((value: W | ((value: R) => W)) => void) =>
{
  const registry = injectRegistry()
  const atomRef = computed(atom)
  watchEffect((onCleanup) => {
    onCleanup(registry.mount(atomRef.value))
  })
  return setAtom(registry, atomRef, options)
}

/**
 * Returns a read-only Vue ref that tracks an atom reference.
 *
 * @stability unstable
 * @category composables
 * @since 4.0.0
 */
export const useAtomRef = <A>(atomRef: () => AtomRef.ReadonlyRef<A>): Readonly<Ref<A>> => {
  const atomRefRef = computed(atomRef)
  const value = shallowRef<A>(atomRefRef.value.value)
  watchEffect((onCleanup) => {
    const ref = atomRefRef.value
    onCleanup(ref.subscribe((next: A) => {
      value.value = next
    }))
    value.value = ref.value
  })
  return value as Readonly<Ref<A>>
}
