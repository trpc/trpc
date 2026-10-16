/**
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
 * @stability unstable
 * @since 4.0.0
 * @category re-exports
 */
export * as AtomRegistry from "effect/reactivity/AtomRegistry"

/**
 * @stability unstable
 * @since 4.0.0
 * @category re-exports
 */
export * as AsyncResult from "effect/reactivity/AsyncResult"

/**
 * @stability unstable
 * @since 4.0.0
 * @category re-exports
 */
export * as Atom from "effect/reactivity/Atom"

/**
 * @stability unstable
 * @since 4.0.0
 * @category re-exports
 */
export * as AtomRef from "effect/reactivity/AtomRef"

/**
 * @stability unstable
 * @since 4.0.0
 * @category re-exports
 */
export * as AtomHttpApi from "effect/reactivity/AtomHttpApi"

/**
 * @stability unstable
 * @since 4.0.0
 * @category re-exports
 */
export * as AtomRpc from "effect/reactivity/AtomRpc"

/**
 * @since 4.0.0
 * @category symbols
 */
export const registryKey = Symbol.for("@effect/atom-vue/registryKey") as InjectionKey<AtomRegistry.AtomRegistry>

/**
 * @since 4.0.0
 * @category constants
 */
export const defaultRegistry: AtomRegistry.AtomRegistry = AtomRegistry.make()

/**
 * @since 4.0.0
 * @category accessors
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
 * @since 4.0.0
 * @category composables
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
 * @since 4.0.0
 * @category composables
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
 * @since 4.0.0
 * @category composables
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
 * @since 4.0.0
 * @category composables
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
