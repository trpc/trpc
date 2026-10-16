import type { StandardBody } from '@standard-server/core'
import type { BracketNotationSerializerOptions } from './bracket-notation'
import type { OpenAPIJsonSerializerOptions } from './openapi-json-serializer'
import { createORPCErrorFromJson, isORPCErrorJson, toORPCError, wrapAsyncIteratorPreservingEventMeta } from '@orpc/client'
import { isAsyncIteratorObject } from '@orpc/shared'
import { ErrorEvent } from '@standard-server/core'
import { BracketNotationSerializer } from './bracket-notation'
import { OpenAPIJsonSerializer } from './openapi-json-serializer'

export interface OpenAPISerializerSerializeOptions {
  /**
   * Use FormData for serialization when nested blobs are present.
   * Does not apply to root-level Blob values.
   *
   * @default true
   */
  useFormDataForBlobFields?: boolean

  /**
   * When enabled, the serialized output is always returned as a FormData instance using bracket notation.
   *
   * @default false
   */
  asFormData?: boolean | undefined
}

export interface OpenAPISerializerOptions extends OpenAPIJsonSerializerOptions {
  /**
   * Options for bracket notation serializer, like maxDeserializingEmptySlots
   */
  bracketNotation?: BracketNotationSerializerOptions | undefined

  /**
   * Default options for serialize method
   */
  serialize?: OpenAPISerializerSerializeOptions | undefined
}

/**
 * Handles one-way serialization of oRPC payloads into JSON-friendly formats,
 * partially supporting complex data types beyond plain JSON such as `Date`, `BigInt`, and `Set`.
 *
 * @see {@link https://orpc.dev/docs/openapi/serializer | OpenAPI Serializer}
 */
export class OpenAPISerializer {
  private readonly jsonSerializer: OpenAPIJsonSerializer
  private readonly bracketNotation: BracketNotationSerializer
  private readonly defaultSerializeOptions: OpenAPISerializerSerializeOptions | undefined

  constructor(
    { bracketNotation, serialize, ...options }: OpenAPISerializerOptions = {},
  ) {
    this.jsonSerializer = new OpenAPIJsonSerializer(options)
    this.bracketNotation = new BracketNotationSerializer(bracketNotation)
    this.defaultSerializeOptions = serialize
  }

  serialize(data: unknown, options: OpenAPISerializerSerializeOptions = {}): StandardBody {
    if (!options.asFormData) {
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

            return { done: result.done, value: this.serializeValue(result.value, false, false) }
          },
          mapError: e => new ErrorEvent(
            this.serializeValue(toORPCError(e).toJSON(), false, false),
            { cause: e },
          ),
        })
      }
    }

    const useFormDataForBlobFields = options.useFormDataForBlobFields ?? this.defaultSerializeOptions?.useFormDataForBlobFields ?? true
    const asFormData = options.asFormData ?? this.defaultSerializeOptions?.asFormData ?? false
    return this.serializeValue(data, useFormDataForBlobFields, asFormData)
  }

  private serializeValue(value: unknown, useFormDataForBlobFields: boolean, asFormData: boolean): unknown {
    const { json, blobs } = this.jsonSerializer.serialize(value)

    if (!asFormData && (json instanceof Blob || json === undefined || !blobs?.length || !useFormDataForBlobFields)) {
      return json
    }

    const form = new FormData()

    for (const [path, value] of this.bracketNotation.serialize(json)) {
      if (value instanceof Blob) {
        form.append(path, value)
      }
      else if (value !== undefined && value !== null) {
        form.append(path, String(value))
      }
    }

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

          return { done: result.done, value: this.jsonSerializer.deserialize({ json: result.value }) }
        },
        mapError: (e) => {
          if (e instanceof ErrorEvent) {
            const deserialized = this.jsonSerializer.deserialize({ json: e.data })

            if (isORPCErrorJson(deserialized)) {
              return createORPCErrorFromJson(deserialized, { cause: e })
            }
          }

          return e
        },
      })
    }

    if (data instanceof URLSearchParams || data instanceof FormData) {
      data = this.bracketNotation.deserialize(Array.from(data.entries()))
    }

    return this.jsonSerializer.deserialize({ json: data })
  }
}
