/**
 * Saves and restores serializable atom state.
 *
 * `dehydrate` reads atoms marked with `Atom.serializable` from an
 * `AtomRegistry` and returns encoded entries keyed by their serialization keys.
 * `hydrate` preloads those entries into another registry before the atoms are
 * read. Initial `AsyncResult` values can be ignored, encoded as values, or
 * represented by promises that update the target registry once the result is no
 * longer initial.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "../Schema.ts"
import * as AsyncResult from "./AsyncResult.ts"
import * as Atom from "./Atom.ts"
import type * as AtomRegistry from "./AtomRegistry.ts"

/**
 * Marker interface for entries in a dehydrated atom registry state.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DehydratedAtom {
  readonly "~effect/reactivity/Hydration/DehydratedAtom": true
}

/**
 * A dehydrated serializable atom value.
 *
 * **Details**
 *
 * It stores the atom serialization key, encoded value, dehydration timestamp, and
 * an optional promise used when an `AsyncResult.Initial` value is encoded as a
 * future non-initial value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DehydratedAtomValue extends DehydratedAtom {
  readonly key: string
  readonly value: unknown
  readonly dehydratedAt: number
  readonly resultPromise?: Promise<unknown> | undefined
}

const Skipped = Symbol.for("effect/reactivity/Hydration/Skipped")

const encodeOrSkip = (
  atom: Atom.Atom<any> & Atom.Serializable<any>,
  value: unknown
): unknown => {
  try {
    return atom[Atom.SerializableTypeId].encode(value)
  } catch (error) {
    if (Schema.isSchemaError(error)) return Skipped
    throw error
  }
}

/**
 * Encodes the serializable atoms currently stored in a registry into dehydrated
 * state.
 *
 * **Details**
 *
 * Only atoms marked with `Atom.serializable` whose current values can be encoded
 * are included. Atoms that fail schema encoding are skipped without throwing.
 * `encodeInitialAs` controls whether `AsyncResult.Initial` values are ignored,
 * encoded as values, or represented by promises that resolve when the atom
 * leaves the initial state.
 *
 * @stability unstable
 * @category dehydration
 * @since 4.0.0
 */
export const dehydrate = (
  registry: AtomRegistry.AtomRegistry,
  options?: {
    /**
     * How to encode `AsyncResult.Initial` values. Default is "ignore".
     */
    readonly encodeInitialAs?: "ignore" | "promise" | "value-only" | undefined
  }
): Array<DehydratedAtom> => {
  const encodeInitialResultMode = options?.encodeInitialAs ?? "ignore"
  const arr: Array<DehydratedAtomValue> = []
  const now = Date.now()
  registry.getNodes().forEach((node, key) => {
    if (!Atom.isSerializable(node.atom)) return
    const atom = node.atom
    const value = node.value()
    const isInitial = AsyncResult.isAsyncResult(value) && AsyncResult.isInitial(value)
    if (encodeInitialResultMode === "ignore" && isInitial) return
    const encodedValue = encodeOrSkip(atom, value)
    if (encodedValue === Skipped) return

    // Create a promise that resolves when the atom moves out of Initial state
    let resultPromise: Promise<unknown> | undefined
    if (encodeInitialResultMode === "promise" && isInitial) {
      resultPromise = new Promise((resolve) => {
        const unsubscribe = registry.subscribe(atom, (newValue) => {
          if (AsyncResult.isAsyncResult(newValue) && !AsyncResult.isInitial(newValue)) {
            unsubscribe()
            resolve(encodeOrSkip(atom, newValue))
          }
        })
      })
    }

    arr.push({
      "~effect/reactivity/Hydration/DehydratedAtom": true,
      key: key as string,
      value: encodedValue,
      dehydratedAt: now,
      resultPromise
    })
  })
  return arr as any
}

/**
 * Returns dehydrated state entries as `DehydratedAtomValue` records.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toValues = (state: ReadonlyArray<DehydratedAtom>): Array<DehydratedAtomValue> => state as any

/**
 * Applies dehydrated atom state to a registry.
 *
 * **When to use**
 *
 * Use to preload serialized atom values into a target registry before those
 * atoms are read.
 *
 * **Details**
 *
 * Encoded values are preloaded by serialization key. Entries with a
 * `resultPromise` update the matching registry node, or preload the resolved value,
 * when the promise resolves.
 *
 * @stability unstable
 * @category hydration
 * @since 4.0.0
 */
export const hydrate = (
  registry: AtomRegistry.AtomRegistry,
  dehydratedState: Iterable<DehydratedAtom>
): void => {
  for (const datom of (dehydratedState as Iterable<DehydratedAtomValue>)) {
    registry.setSerializable(datom.key, datom.value)

    // If there's a resultPromise, it means this was in Initial state when dehydrated
    // and we should wait for it to resolve to a non-Initial state, then update the registry
    if (!datom.resultPromise) continue
    datom.resultPromise.then((resolvedValue) => {
      if (resolvedValue === Skipped) return
      // Try to update the existing node directly instead of using setSerializable
      const nodes = registry.getNodes()
      const node = nodes.get(datom.key)
      if (node) {
        // Decode the resolved value using the node's atom serializable decoder
        const atom = node.atom as any
        if (atom[Atom.SerializableTypeId]) {
          const decoded = atom[Atom.SerializableTypeId].decode(resolvedValue)
          ;(node as any).setValue(decoded)
        }
      } else {
        // Fallback to setSerializable if node doesn't exist yet
        registry.setSerializable(datom.key, resolvedValue)
      }
    })
  }
}
