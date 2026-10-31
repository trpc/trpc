/** @internal */
export const getAllObjectKeys = (obj: object): Set<PropertyKey> => {
  const keys = new Set<PropertyKey>(Reflect.ownKeys(obj))
  if (obj.constructor === Object) return keys

  if (obj instanceof Error) {
    keys.delete("stack")
  }

  const proto = Object.getPrototypeOf(obj)
  let current = proto

  while (current !== null && current !== Object.prototype) {
    const ownKeys = Reflect.ownKeys(current)
    for (let i = 0; i < ownKeys.length; i++) {
      keys.add(ownKeys[i])
    }
    current = Object.getPrototypeOf(current)
  }
  if (keys.has("constructor") && typeof obj.constructor === "function" && proto === obj.constructor.prototype) {
    keys.delete("constructor")
  }

  return keys
}

/** @internal */
export const byReferenceInstances = new WeakSet<object>()

/** @internal */
export const viewBytes = (view: DataView): Uint8Array => new Uint8Array(view.buffer, view.byteOffset, view.byteLength)

/** @internal */
export const isArrayBufferLike = (u: unknown): u is ArrayBufferLike =>
  u instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && u instanceof SharedArrayBuffer)

/**
 * Returns `undefined` for detached buffers, which can no longer be read.
 *
 * @internal
 */
export const bufferBytes = (buffer: ArrayBufferLike): Uint8Array | undefined => {
  try {
    return new Uint8Array(buffer)
  } catch {
    return undefined
  }
}
