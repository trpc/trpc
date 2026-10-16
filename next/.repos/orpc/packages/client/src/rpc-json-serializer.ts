import type { Segment } from '@orpc/shared'
import { copyOnWrite, DEFAULT_MAX_BIGINT_DIGITS, isPlainObject, NullProtoObj, parseBigIntString } from '@orpc/shared'

export type RPCJsonSerializationMeta = [type: string, ...path: Segment[]]
export type RPCJsonSerialization
  = | { json: unknown, meta?: RPCJsonSerializationMeta[] | undefined, maps?: undefined, blobs?: undefined }
    | { json: unknown, meta?: RPCJsonSerializationMeta[] | undefined, maps: Segment[][], blobs: Blob[] }

export interface RPCJsonSerializerHandler {
  condition(value: unknown): boolean
  serialize(value: any): unknown
  /**
   * `serialized` comes from the wire, so validate its type and throw on mismatch.
   */
  deserialize(serialized: unknown): unknown
  /**
   * If false, the result of this serializer will not be further processed by other serializers,
   * even if it matches their conditions and treat it as final serialized value.
   * This can be useful for serializers that return primitive values, which should not be further processed.
   * to improve performance and avoid potential issues with other serializers.
   *
   * @default false
   */
  isTerminal?: boolean
}

function invalidSerializedData(detail: string): TypeError {
  return new TypeError(`Invalid RPC serialized data: ${detail}`)
}

function assertSerializedType(ok: boolean, type: string, expected: string): void {
  if (!ok) {
    throw invalidSerializedData(`type "${type}" expects ${expected}.`)
  }
}

function isWalkable(value: unknown): boolean {
  return Array.isArray(value) || isPlainObject(value)
}

function walkInto(parent: any, key: Segment, original: unknown, restored?: Set<unknown>): any {
  const value = parent[key]

  if (!isWalkable(value) || restored?.has(value)) {
    throw invalidSerializedData(`segment "${key}" cannot be walked into.`)
  }

  return value === original ? copyOnWrite(parent, key, original) : value
}

const DEFAULT_RPC_JSON_SERIALIZER_HANDLERS: Record<string, RPCJsonSerializerHandler> = {
  undefined: {
    condition(data: unknown): boolean {
      return data === undefined
    },
    serialize() {
      return null
    },
    deserialize(serialized: null): undefined {
      assertSerializedType(serialized === null, 'undefined', 'null')
      return undefined
    },
    isTerminal: true,
  },
  bigint: {
    condition(data: unknown): boolean {
      return typeof data === 'bigint'
    },
    serialize(data: bigint): string {
      return data.toString()
    },
    deserialize(serialized: string): bigint {
      assertSerializedType(typeof serialized === 'string', 'bigint', 'a string')
      const value = parseBigIntString(serialized, DEFAULT_MAX_BIGINT_DIGITS)

      if (value === undefined) {
        throw invalidSerializedData(`type "bigint" expects a decimal integer string of at most ${DEFAULT_MAX_BIGINT_DIGITS} digits.`)
      }

      return value
    },
    isTerminal: true,
  },
  date: {
    condition(data: unknown): boolean {
      return data instanceof Date
    },
    serialize(data: Date): string | null {
      if (Number.isNaN(data.getTime())) {
        return null
      }

      return data.toISOString()
    },
    deserialize(serialized: string | null): Date {
      assertSerializedType(typeof serialized === 'string' || serialized === null, 'date', 'a string or null')
      return new Date(serialized ?? Number.NaN)
    },
    isTerminal: true,
  },
  nan: {
    condition(data: unknown): boolean {
      return typeof data === 'number' && Number.isNaN(data)
    },
    serialize() {
      return null
    },
    deserialize(serialized: null): number {
      assertSerializedType(serialized === null, 'nan', 'null')
      return Number.NaN
    },
    isTerminal: true,
  },
  infinity: {
    condition(data: unknown): boolean {
      return data === Number.POSITIVE_INFINITY || data === Number.NEGATIVE_INFINITY
    },
    serialize(data: number): string {
      return data > 0 ? 'Infinity' : '-Infinity'
    },
    deserialize(serialized: string): number {
      assertSerializedType(serialized === 'Infinity' || serialized === '-Infinity', 'infinity', '"Infinity" or "-Infinity"')
      return serialized === 'Infinity' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
    },
    isTerminal: true,
  },
  url: {
    condition(data: unknown): boolean {
      return data instanceof URL
    },
    serialize(data: URL): string {
      return data.toString()
    },
    deserialize(serialized: string): URL {
      assertSerializedType(typeof serialized === 'string', 'url', 'a string')
      return new URL(serialized)
    },
    isTerminal: true,
  },
  set: {
    condition(data: unknown): boolean {
      return data instanceof Set
    },
    serialize(data: Set<unknown>): unknown[] {
      return Array.from(data)
    },
    deserialize(serialized: unknown[]): Set<unknown> {
      assertSerializedType(Array.isArray(serialized), 'set', 'an array')
      return new Set(serialized)
    },
  },
  map: {
    condition(data: unknown): boolean {
      return data instanceof Map
    },
    serialize(data: Map<unknown, unknown>): unknown[] {
      return Array.from(data.entries())
    },
    deserialize(serialized: [unknown, unknown][]): Map<unknown, unknown> {
      assertSerializedType(Array.isArray(serialized), 'map', 'an array')
      return new Map(serialized)
    },
  },
}

export interface RPCJsonSerializerOptions {
  /**
   * Extend or override the built-in type handlers used during serialization and deserialization.
   *
   * Each key is a unique type identifier (e.g. `"date"`, `"bigint"`) and maps to a handler
   * that defines how to detect, serialize, and deserialize values of that type.
   *
   * **Extending:** Add new keys to support custom types:
   * ```ts
   * handlers: {
   *   buffer: {
   *     condition: (v) => v instanceof Buffer,
   *     serialize: (v: Buffer) => v.toString('base64'),
   *     deserialize: (s: string) => Buffer.from(s, 'base64'),
   *     isTerminal: true,
   *   }
   * }
   * ```
   *
   * **Overriding:** Use an existing key to replace a built-in handler:
   * ```ts
   * handlers: {
   *   date: {
   *     condition: (v) => v instanceof Date,
   *     serialize: (v: Date) => v.getTime(),
   *     deserialize: (n: number) => new Date(n),
   *     isTerminal: true,
   *   }
   * }
   * ```
   *
   * **Disabling:** Set a key to `undefined` to remove a built-in handler:
   * ```ts
   * handlers: { url: undefined }
   * ```
   *
   * Built-in type keys: `undefined`, `bigint`, `date`, `nan`, `infinity`, `url`, `set`, `map`.
   */
  handlers?: Record<string, undefined | RPCJsonSerializerHandler> | undefined

  /**
   * If true, properties with undefined values will be omitted during serialization.
   *
   * @default true
   */
  omitUndefinedProperties?: boolean | undefined
}

/**
 * Serializes and deserializes native types like Date, BigInt, Set, and Map
 * into a JSON value plus separate metadata describing how to restore them.
 *
 * @see {@link https://orpc.dev/docs/rpc/serializer#rpc-json-serializer | RPC Serializer - RPC JSON Serializer}
 */
export class RPCJsonSerializer {
  private readonly handlers: Exclude<RPCJsonSerializerOptions['handlers'], undefined>
  private readonly inlineBuiltInHandlers: boolean
  private readonly handlerEntries: [string, RPCJsonSerializerHandler][] | undefined
  private readonly omitUndefinedProperties: boolean

  constructor(options: RPCJsonSerializerOptions = {}) {
    this.omitUndefinedProperties = options.omitUndefinedProperties !== false
    this.handlers = Object.assign(new NullProtoObj(), DEFAULT_RPC_JSON_SERIALIZER_HANDLERS)
    const customHandlers = options.handlers

    if (customHandlers === undefined) {
      this.inlineBuiltInHandlers = true
      return
    }

    let inlineBuiltInHandlers = true
    let handlerEntries: [string, RPCJsonSerializerHandler][] = []

    for (const key of Object.keys(customHandlers)) {
      const handler = customHandlers[key]
      this.handlers[key] = handler

      if (inlineBuiltInHandlers && key in DEFAULT_RPC_JSON_SERIALIZER_HANDLERS) {
        inlineBuiltInHandlers = false
      }

      if (inlineBuiltInHandlers && handler !== undefined) {
        handlerEntries.push([key, handler])
      }
    }

    if (!inlineBuiltInHandlers) {
      handlerEntries = []
      for (const key of Object.keys(this.handlers)) {
        const handler = this.handlers[key]
        if (handler !== undefined) {
          handlerEntries.push([key, handler])
        }
      }
    }

    this.inlineBuiltInHandlers = inlineBuiltInHandlers
    this.handlerEntries = handlerEntries
  }

  serialize(data: unknown): RPCJsonSerialization {
    let meta: RPCJsonSerializationMeta[] | undefined = []
    const maps: Segment[][] = []
    const blobs: Blob[] = []

    const json = this.serializeValue(data, [], meta, maps, blobs)

    meta = meta.length === 0 ? undefined : meta

    if (maps.length === 0) {
      return { json, meta }
    }

    return { json, meta, maps, blobs }
  }

  /**
   * `segments` is a shared mutable stack (push/pop while walking),
   * so it must be copied before being stored in `meta` or `maps`.
   */
  private serializeValue(data: unknown, segments: Segment[], meta: RPCJsonSerializationMeta[], maps: Segment[][], blobs: Blob[]): unknown {
    /**
     * Inlined version of DEFAULT_RPC_JSON_SERIALIZER_HANDLERS: primitives are
     * dispatched on typeof and skip every handler condition check.
     * Must match the built-in handlers exactly.
     */
    if (this.inlineBuiltInHandlers) {
      switch (typeof data) {
        case 'string':
        case 'boolean':
          return data
        case 'number':
          if (Number.isFinite(data)) {
            return data
          }
          if (Number.isNaN(data)) {
            meta.push(['nan', ...segments])
            return null
          }
          meta.push(['infinity', ...segments])
          return data > 0 ? 'Infinity' : '-Infinity'
        case 'undefined':
          meta.push(['undefined', ...segments])
          return null
        case 'bigint':
          meta.push(['bigint', ...segments])
          return data.toString()
        case 'object': {
          if (data === null) {
            return data
          }
          if (data instanceof Date) {
            meta.push(['date', ...segments])
            return Number.isNaN(data.getTime()) ? null : data.toISOString()
          }
          if (data instanceof URL) {
            meta.push(['url', ...segments])
            return data.toString()
          }
          if (data instanceof Set) {
            const result = this.serializeValue(Array.from(data), segments, meta, maps, blobs)
            meta.push(['set', ...segments])
            return result
          }
          if (data instanceof Map) {
            const result = this.serializeValue(Array.from(data.entries()), segments, meta, maps, blobs)
            meta.push(['map', ...segments])
            return result
          }
        }
      }
    }

    const handlerEntries = this.handlerEntries
    if (handlerEntries) {
      for (let i = 0; i < handlerEntries.length; i++) {
        const entry = handlerEntries[i]!
        const handler = entry[1]

        if (handler.condition(data)) {
          const serialized = handler.serialize(data)

          if (handler.isTerminal) {
            meta.push([entry[0], ...segments])

            if (serialized instanceof Blob) {
              maps.push(segments.slice())
              blobs.push(serialized)
            }

            return serialized
          }

          const result = this.serializeValue(serialized, segments, meta, maps, blobs)
          meta.push([entry[0], ...segments])
          return result
        }
      }
    }

    if (data instanceof Blob) {
      maps.push(segments.slice())
      blobs.push(data)
      return data
    }

    if (Array.isArray(data)) {
      const json: unknown[] = []

      for (let i = 0; i < data.length; i++) {
        segments.push(i)
        json.push(this.serializeValue(data[i], segments, meta, maps, blobs))
        segments.pop()
      }

      return json
    }

    if (isPlainObject(data)) {
      const json: Record<string, unknown> = new NullProtoObj()

      for (const k of Object.keys(data)) {
        const v = data[k]
        /**
         * Skip custom toJSON methods to avoid JSON.stringify invoking them,
         * which could cause meta and serialized data mismatches during deserialization.
         * Instead, rely on custom handlers.
         */
        if (k === 'toJSON' && typeof v === 'function') {
          continue
        }

        if (v === undefined && this.omitUndefinedProperties) {
          continue
        }

        segments.push(k)
        json[k] = this.serializeValue(v, segments, meta, maps, blobs)
        segments.pop()
      }

      return json
    }

    return data
  }

  deserialize(serialized: RPCJsonSerialization): unknown {
    const ref = { json: serialized.json }

    if (serialized.blobs?.length) {
      for (let i = 0; i < serialized.maps.length; i++) {
        const blob = serialized.blobs[i]

        if (!(blob instanceof Blob)) {
          throw invalidSerializedData(`blob ${i} is not a Blob.`)
        }

        const segments = serialized.maps[i]!

        let original: any = serialized
        let currentRef: any = ref
        let preSegment: string | number = 'json'

        for (let j = 0; j < segments.length; j++) {
          original = original[preSegment]
          currentRef = walkInto(currentRef, preSegment, original)
          preSegment = segments[j]!

          if (!Object.hasOwn(currentRef, preSegment)) {
            throw invalidSerializedData(`segment "${preSegment}" does not exist.`)
          }
        }

        currentRef[preSegment] = blob
      }
    }

    const meta = serialized.meta

    if (meta) {
      let restored: Set<unknown> | undefined

      /**
       * `[segment, container, original]` per step of the previous entry's walk, reused for the shared path prefix.
       * Only containers above its target are kept, so none can be a value a handler restored.
       */
      const chain: unknown[] | undefined = meta.length === 1 ? undefined : []
      let chainDepth = 0

      for (const item of meta) {
        const type = item[0]
        const handler = this.handlers[type]

        if (handler === undefined) {
          throw invalidSerializedData(`type "${type}" is not supported.`)
        }

        const depth = item.length - 1
        const shared = Math.min(depth, chainDepth)
        let d = 0
        let original: any = serialized
        let currentRef: any = ref
        let preSegment: string | number = 'json'

        if (chain !== undefined && shared > 0) {
          d = 1

          while (d < shared && chain[3 * d] === item[d]) {
            d++
          }

          currentRef = chain[3 * d - 2]
          original = chain[3 * d - 1]
          preSegment = item[d]!

          if (!Object.hasOwn(currentRef, preSegment)) {
            throw invalidSerializedData(`segment "${preSegment}" does not exist.`)
          }
        }

        while (d < depth) {
          original = original[preSegment]
          currentRef = walkInto(currentRef, preSegment, original, restored)

          if (chain !== undefined) {
            chain[3 * d] = preSegment
            chain[3 * d + 1] = currentRef
            chain[3 * d + 2] = original
          }

          preSegment = item[++d]!

          if (!Object.hasOwn(currentRef, preSegment)) {
            throw invalidSerializedData(`segment "${preSegment}" does not exist.`)
          }
        }

        chainDepth = depth

        const value = handler.deserialize(currentRef[preSegment])
        currentRef[preSegment] = value

        if (isWalkable(value)) {
          (restored ??= new Set()).add(value)
        }
      }
    }

    return ref.json
  }
}
