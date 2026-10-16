import type { Segment } from '@orpc/shared'
import { getOwn, isPlainObject, NullProtoObj, setOwn } from '@orpc/shared'

export type BracketNotationSerializeResult = [string, unknown][]

export interface BracketNotationSerializerOptions {
  /**
   * Maximum number of empty slots that explicit array indexes may leave in total during deserialization
   * (e.g., `a[0]=x&a[3]=y` leaves 2). An index that would exceed it turns its array into an object
   * instead (e.g., `?arr[5000]=x` becomes `{ arr: { 5000: 'x' } }`).
   *
   * Empty slots take memory (a lone `?arr[999]=x` takes ~12KB in V8), and code iterating an array walks
   * every one of them, so this keeps both in line with the input.
   *
   * NOTE: Append-style notation (e.g., `arr[]`) never leaves empty slots.
   *
   * @default 1_000
   */
  maxDeserializingEmptySlots?: number
}

export class BracketNotationSerializer {
  private readonly maxDeserializingEmptySlots: number

  constructor(options: BracketNotationSerializerOptions = {}) {
    this.maxDeserializingEmptySlots = options.maxDeserializingEmptySlots ?? 1_000
  }

  serialize(data: unknown): BracketNotationSerializeResult {
    const result: BracketNotationSerializeResult = []
    this.internalSerialize(data, '', true, result)
    return result
  }

  private internalSerialize(data: unknown, path: string, isRoot: boolean, result: BracketNotationSerializeResult): void {
    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        this.internalSerialize(item, isRoot ? i.toString() : `${path}[${i}]`, false, result)
      })
    }

    else if (isPlainObject(data)) {
      for (const key of Object.keys(data)) {
        this.internalSerialize(data[key], isRoot ? key : `${path}[${key}]`, false, result)
      }
    }

    else {
      result.push([path, data])
    }
  }

  deserialize(serialized: BracketNotationSerializeResult): Record<string, unknown> {
    // A caller-supplied object value can become a container for deeper paths, and unlike
    // `NullProtoObj` it carries a real prototype, so accesses below stay own-property only.
    let arrayPushStyles: WeakSet<unknown[]> | undefined
    const root: Record<string, unknown> = new NullProtoObj()
    let emptySlotsLeft = this.maxDeserializingEmptySlots

    for (const [path, value] of serialized) {
      const segments = this.parsePath(path)

      let currentRef: any = root
      // Arrays take keys as numbers, so engines do not parse the same key again on each access
      let nextSegment: string | number = segments[0]!

      for (let i = 1; i < segments.length; i++) {
        const segment = segments[i]!
        const isLast = i === segments.length - 1

        const existing: any = getOwn(currentRef, nextSegment)
        let child: any = existing
        let key: string | number = segment

        // A missing or primitive value is treated like an empty array, which becomes an object if it cannot stay one
        if (Array.isArray(child) || !isPlainObject(child)) {
          const isArray = Array.isArray(child)
          const isPushStyle = isArray && !!arrayPushStyles?.has(child)
          const length = isArray ? child.length : 0
          const index = internalToArrayIndex(segment)
          const emptySlots = index === undefined ? 0 : Math.max(0, index - length)

          const canBeArray = segment === ''
            ? isLast && (isPushStyle || length === 0)
            : index !== undefined && !(isLast && isPushStyle) && emptySlots <= emptySlotsLeft

          if (canBeArray) {
            emptySlotsLeft -= emptySlots
            child = isArray ? child : []
            key = index ?? segment
          }
          else if (isArray) {
            arrayPushStyles?.delete(child)
            child = isPushStyle ? internalPushStyleArrayToObject(child) : internalArrayToObject(child)
          }
          else {
            child = new NullProtoObj()
          }
        }

        if (child !== existing) {
          internalSetOwn(currentRef, nextSegment, child)
        }

        currentRef = child
        nextSegment = key
      }

      if (Array.isArray(currentRef) && nextSegment === '') {
        arrayPushStyles ??= new WeakSet()
        arrayPushStyles.add(currentRef)
        currentRef.push(value)
      }
      else if (Object.hasOwn(currentRef, nextSegment)) {
        const current = currentRef[nextSegment]

        if (Array.isArray(current)) {
          current.push(value)
        }
        else {
          internalSetOwn(currentRef, nextSegment, [current, value])
        }
      }
      else {
        internalSetOwn(currentRef, nextSegment, value)
      }
    }

    return root
  }

  stringifyPath(segments: readonly Segment[]): string {
    if (segments.length === 0) {
      return ''
    }

    let result = segments[0]!.toString()

    for (let i = 1; i < segments.length; i++) {
      result += `[${segments[i]}]`
    }

    return result
  }

  parsePath(path: string): string[] {
    const start = path.indexOf('[')

    // Brackets must open after the first segment and close at the very end, e.g. `a[b][c]`
    if (start === -1 || path[path.length - 1] !== ']') {
      return [path]
    }

    const segments = [path.slice(0, start)]
    let from = start + 1
    let to = path.indexOf('][', from)

    while (to !== -1) {
      segments.push(path.slice(from, to))
      from = to + 2
      to = path.indexOf('][', from)
    }

    segments.push(path.slice(from, -1))
    return segments
  }
}

/**
 * The largest array index. Larger integer keys are ordinary properties.
 */
const MAX_ARRAY_INDEX = 2 ** 32 - 2

/**
 * Returns `key` as an array index (no sign, no leading zeros), which is also how engines store the
 * integer keys of objects, or `undefined` if it is not one.
 */
function internalToArrayIndex(key: string): number | undefined {
  // `MAX_ARRAY_INDEX` has 10 digits
  if (key.length === 0 || key.length > 10) {
    return undefined
  }

  let index = key.charCodeAt(0) - 48 // '0'

  if (index < 0 || index > 9 || (index === 0 && key.length > 1)) {
    return undefined
  }

  for (let i = 1; i < key.length; i++) {
    const digit = key.charCodeAt(i) - 48

    if (digit < 0 || digit > 9) {
      return undefined
    }

    index = index * 10 + digit
  }

  return index <= MAX_ARRAY_INDEX ? index : undefined
}

function internalArrayToObject(array: readonly unknown[]): Record<string, unknown> {
  const obj = new NullProtoObj() // Prevent Prototype Pollution with NullProtoObj

  array.forEach((item, i) => {
    obj[i] = item
  })

  return obj
}

function internalPushStyleArrayToObject(array: readonly unknown[]): Record<string, unknown> {
  const obj = new NullProtoObj()

  obj[''] = array.length === 1 ? array[0] : array

  return obj
}

/**
 * Like `setOwn`, but first switches an object created during deserialization to sparse storage when an
 * integer key would leave a gap. Engines keep integer keys in a flat backing store sized by the largest one,
 * so a lone `{ 999: x }` takes ~12KB in V8. Holding `MAX_ARRAY_INDEX` switches an object to sparse storage
 * for good (V8 and JSC), so writing and deleting it keeps the object's integer keys cheap without a trace.
 */
function internalSetOwn(container: Record<string, unknown>, key: string | number, value: unknown): void {
  if (typeof key === 'string' && container instanceof NullProtoObj) {
    const index = internalToArrayIndex(key)

    // `0`, or the key right after an existing one, keeps the flat store filled
    if (index !== undefined && index !== 0 && !Object.hasOwn(container, index - 1) && !Object.hasOwn(container, MAX_ARRAY_INDEX)) {
      container[MAX_ARRAY_INDEX] = undefined
      delete container[MAX_ARRAY_INDEX]
    }
  }

  setOwn(container, key, value)
}
