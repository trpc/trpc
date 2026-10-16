import type { Segment } from '@orpc/shared'
import { copyOnWrite, isPlainObject, NullProtoObj } from '@orpc/shared'

export type OpenAPIJsonSerialization
  = | { json: unknown, maps?: undefined, blobs?: undefined }
    | { json: unknown, maps: Segment[][], blobs: Blob[] }

export interface OpenAPIJsonSerializerHandler {
  condition(value: unknown): boolean
  serialize(value: any): unknown
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

const DEFAULT_OPEN_API_JSON_SERIALIZER_HANDLERS: Record<string, OpenAPIJsonSerializerHandler> = {
  undefined: {
    condition(data: unknown): boolean {
      return data === undefined
    },
    serialize() {
      return null
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
    isTerminal: true,
  },
  nan: {
    condition(data: unknown): boolean {
      return typeof data === 'number' && Number.isNaN(data)
    },
    serialize() {
      return null
    },
    isTerminal: true,
  },
  infinity: {
    condition(data: unknown): boolean {
      return data === Number.POSITIVE_INFINITY || data === Number.NEGATIVE_INFINITY
    },
    serialize() {
      return null
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
    isTerminal: true,
  },
  set: {
    condition(data: unknown): boolean {
      return data instanceof Set
    },
    serialize(data: Set<unknown>): unknown[] {
      return Array.from(data)
    },
  },
  map: {
    condition(data: unknown): boolean {
      return data instanceof Map
    },
    serialize(data: Map<unknown, unknown>): unknown[] {
      return Array.from(data.entries())
    },
  },
}

export interface OpenAPIJsonSerializerOptions {
  /**
   * Extend or override the built-in type handlers used during serialization.
   *
   * Each key is a unique type identifier (e.g. `"date"`, `"bigint"`) and maps to a handler
   * that defines how to detect and serialize values of that type.
   *
   * **Extending:** Add new keys to support custom types:
   * ```ts
   * handlers: {
   *   buffer: {
   *     condition: (v) => v instanceof Buffer,
   *     serialize: (v: Buffer) => v.toString('base64'),
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
  handlers?: Record<string, undefined | OpenAPIJsonSerializerHandler> | undefined

  /**
   * If true, properties with undefined values will be omitted during serialization.
   *
   * @default true
   */
  omitUndefinedProperties?: boolean | undefined
}

export class OpenAPIJsonSerializer {
  private readonly inlineBuiltInHandlers: boolean
  private readonly handlerEntries: OpenAPIJsonSerializerHandler[] | undefined
  private readonly omitUndefinedProperties: boolean

  constructor(options: OpenAPIJsonSerializerOptions = {}) {
    this.omitUndefinedProperties = options.omitUndefinedProperties !== false

    const customHandlers = options.handlers

    if (customHandlers === undefined) {
      this.inlineBuiltInHandlers = true
      return
    }

    let inlineBuiltInHandlers = true
    let handlerEntries: OpenAPIJsonSerializerHandler[] = []

    for (const key of Object.keys(customHandlers)) {
      const handler = customHandlers[key]

      if (inlineBuiltInHandlers && key in DEFAULT_OPEN_API_JSON_SERIALIZER_HANDLERS) {
        inlineBuiltInHandlers = false
        break
      }

      if (handler !== undefined) {
        handlerEntries.push(handler)
      }
    }

    if (!inlineBuiltInHandlers) {
      handlerEntries = []
      for (const handler of Object.values({ ...DEFAULT_OPEN_API_JSON_SERIALIZER_HANDLERS, ...customHandlers })) {
        if (handler !== undefined) {
          handlerEntries.push(handler)
        }
      }
    }

    this.inlineBuiltInHandlers = inlineBuiltInHandlers
    this.handlerEntries = handlerEntries
  }

  serialize(data: unknown): OpenAPIJsonSerialization {
    const maps: Segment[][] = []
    const blobs: Blob[] = []

    const json = this.serializeValue(data, [], maps, blobs)

    return { json, maps, blobs }
  }

  /**
   * `segments` is a shared mutable stack (push/pop while walking),
   * so it must be copied before being stored in `maps`.
   */
  private serializeValue(data: unknown, segments: Segment[], maps: Segment[][], blobs: Blob[]): unknown {
    /**
     * Inlined version of DEFAULT_OPEN_API_JSON_SERIALIZER_HANDLERS: primitives
     * are dispatched on typeof and skip every handler condition check.
     * Must match the built-in handlers exactly.
     */
    if (this.inlineBuiltInHandlers) {
      switch (typeof data) {
        case 'string':
        case 'boolean':
          return data
        case 'number':
          return Number.isFinite(data) ? data : null
        case 'undefined':
          return null
        case 'bigint':
          return data.toString()
        case 'object': {
          if (data === null) {
            return data
          }
          if (data instanceof Date) {
            return Number.isNaN(data.getTime()) ? null : data.toISOString()
          }
          if (data instanceof URL) {
            return data.toString()
          }
          if (data instanceof Set) {
            return this.serializeValue(Array.from(data), segments, maps, blobs)
          }
          if (data instanceof Map) {
            return this.serializeValue(Array.from(data.entries()), segments, maps, blobs)
          }
        }
      }
    }

    const handlerEntries = this.handlerEntries
    if (handlerEntries) {
      for (let i = 0; i < handlerEntries.length; i++) {
        const handler = handlerEntries[i]!

        if (handler.condition(data)) {
          const serialized = handler.serialize(data)

          if (handler.isTerminal) {
            if (serialized instanceof Blob) {
              maps.push(segments.slice())
              blobs.push(serialized)
            }

            return serialized
          }

          return this.serializeValue(serialized, segments, maps, blobs)
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
        json.push(this.serializeValue(data[i], segments, maps, blobs))
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
        json[k] = this.serializeValue(v, segments, maps, blobs)
        segments.pop()
      }

      return json
    }

    return data
  }

  deserialize(serialized: OpenAPIJsonSerialization): unknown {
    const ref = { json: serialized.json }

    if (serialized.blobs?.length) {
      for (let i = 0; i < serialized.maps.length; i++) {
        const blob = serialized.blobs[i]

        if (!(blob instanceof Blob)) {
          throw new TypeError(`Invalid OpenAPI serialized data: blob ${i} is not a Blob.`)
        }

        const segments = serialized.maps[i]!

        let original: any = serialized
        let currentRef: any = ref
        let preSegment: string | number = 'json'

        for (let j = 0; j < segments.length; j++) {
          original = original[preSegment]
          currentRef = copyOnWrite(currentRef, preSegment, original)
          preSegment = segments[j]!

          if (!Object.hasOwn(currentRef, preSegment)) {
            throw new TypeError(`Invalid OpenAPI serialized data: segment "${preSegment}" does not exist.`)
          }
        }

        currentRef[preSegment] = blob
      }
    }

    return ref.json
  }
}
