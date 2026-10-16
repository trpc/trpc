import type { StandardBody } from '@standard-server/core'
import type { RPCJsonSerializerOptions } from './rpc-json-serializer'
import { isAsyncIteratorObject, stringifyJSON } from '@orpc/shared'
import { ErrorEvent } from '@standard-server/core'
import { wrapAsyncIteratorPreservingEventMeta } from './async-iterator-object'
import { createORPCErrorFromJson, isORPCErrorJson, toORPCError } from './error-utils'
import { RPCJsonSerializer } from './rpc-json-serializer'

export interface RPCSerializerSerializeOptions {
  /**
   * Use FormData for serialization when nested blobs are present.
   * Does not apply to root-level Blob values.
   *
   * @default true
   */
  useFormDataForBlobFields?: boolean
}

export interface RPCSerializerOptions extends RPCJsonSerializerOptions {
  /**
   * Default options for serialize method
   */
  serialize?: RPCSerializerSerializeOptions | undefined
}

/**
 * Serializes and deserializes data for the RPC protocol,
 * preserving native types like Date, BigInt, Set, and Map that plain JSON cannot represent.
 *
 * @see {@link https://orpc.dev/docs/rpc/serializer | RPC Serializer}
 */
export class RPCSerializer {
  private readonly jsonSerializer: RPCJsonSerializer
  private readonly defaultSerializeOptions: RPCSerializerOptions['serialize']

  constructor(
    options: RPCSerializerOptions = {},
  ) {
    this.jsonSerializer = new RPCJsonSerializer(options)
    this.defaultSerializeOptions = options.serialize
  }

  serialize(data: unknown, options: RPCSerializerSerializeOptions = {}): StandardBody {
    // standard body already supports these types without additional serialization.
    if (data === undefined || data instanceof ReadableStream || data instanceof Blob) {
      return data
    }

    if (isAsyncIteratorObject(data)) {
      return wrapAsyncIteratorPreservingEventMeta(data, {
        mapResult: (result) => {
          // standard event stream data already supports these types without additional serialization.
          if (result.value === undefined) {
            return result
          }

          return { done: result.done, value: this.serializeValue(result.value, false) }
        },
        mapError: e => new ErrorEvent(
          this.serializeValue(toORPCError(e).toJSON(), false),
          { cause: e },
        ),
      })
    }

    const useFormDataForBlobs = options.useFormDataForBlobFields ?? this.defaultSerializeOptions?.useFormDataForBlobFields ?? true
    return this.serializeValue(data, useFormDataForBlobs)
  }

  private serializeValue(data: unknown, useFormDataForBlobs: boolean): unknown {
    const { json, meta, maps, blobs } = this.jsonSerializer.serialize(data)

    if (!useFormDataForBlobs || !blobs?.length) {
      return { json, meta }
    }

    const form = new FormData()

    form.set('data', stringifyJSON({ json, meta, maps }))

    blobs.forEach((blob, i) => {
      form.set(i.toString(), blob)
    })

    return form
  }

  deserialize(data: StandardBody): unknown {
    if (data === undefined || data instanceof ReadableStream || data instanceof Blob) {
      return data
    }

    if (isAsyncIteratorObject(data)) {
      return wrapAsyncIteratorPreservingEventMeta(data, {
        mapResult: (result) => {
          if (result.value === undefined) {
            return result
          }

          return { done: result.done, value: this.deserializeValue(result.value) }
        },
        mapError: (e) => {
          if (!(e instanceof ErrorEvent)) {
            return e
          }

          const deserialized = this.deserializeValue(e.data)

          if (isORPCErrorJson(deserialized)) {
            return createORPCErrorFromJson(deserialized, { cause: e })
          }

          return new ErrorEvent(deserialized, { cause: e })
        },
      })
    }

    return this.deserializeValue(data)
  }

  private deserializeValue(data: any): unknown {
    if (!(data instanceof FormData)) {
      return this.jsonSerializer.deserialize(data)
    }

    const serialized = JSON.parse(data.get('data') as string)

    const blobs: Blob[] = []
    for (const [key, value] of data) {
      if (value instanceof Blob) {
        blobs[Number(key)] = value
      }
    }

    return this.jsonSerializer.deserialize({ ...serialized, blobs })
  }
}
