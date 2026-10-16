// eslint-disable-next-line no-restricted-imports
import type * as OpenAPIV3_0 from '@openapi-spec/types/v3.0'
// eslint-disable-next-line no-restricted-imports
import type * as OpenAPIV3_1 from '@openapi-spec/types/v3.1'
// eslint-disable-next-line no-restricted-imports
import type * as OpenAPIV3_2 from '@openapi-spec/types/v3.2'
import type { AnyNestedClient, Client, ORPCError } from '@orpc/client'
import type { AsyncIteratorClass } from '@orpc/shared'

export type { OpenAPIV3_0, OpenAPIV3_1, OpenAPIV3_2 }

/**
 * An OpenAPI version `OpenAPIGenerator` can target: any `3.0.x`, `3.1.x`, or `3.2.x` value.
 *
 * @see {@link https://orpc.dev/docs/openapi/specification#openapi-version | OpenAPI Specification - OpenAPI Version}
 */
export type OpenAPIVersion = `3.0.${number}` | `3.1.${number}` | `3.2.${number}`

/**
 * The OpenAPI document of the given version.
 *
 * @see {@link https://orpc.dev/docs/openapi/specification#openapi-version | OpenAPI Specification - OpenAPI Version}
 */
export type OpenAPIDocument<TVersion extends OpenAPIVersion>
  = TVersion extends `3.0.${string}` ? OpenAPIV3_0.OpenAPIObject
    : TVersion extends `3.1.${string}` ? OpenAPIV3_1.OpenAPIObject
      : OpenAPIV3_2.OpenAPIObject

export type JsonifiedValue<T>
  = T extends string | number | boolean | null | undefined ? T
    : T extends Date | bigint | URL ? string
      : T extends ReadonlyArray<unknown> ? JsonifiedArray<T>
        // one non-inferring check so plain objects skip the costly `infer` branches below
        : T extends Blob | ReadonlyMap<any, any> | ReadonlySet<any> | AsyncIteratorObject<any, any, any> | Function // eslint-disable-line ts/no-unsafe-function-type
          ? T extends File ? File
            : T extends Blob ? Blob
              : T extends ReadonlyMap<infer K, infer V> ? JsonifiedArray<[K, V][]>
                : T extends ReadonlySet<infer U> ? JsonifiedArray<U[]>
                  : T extends AsyncIteratorClass<infer U, infer V> ? AsyncIteratorClass<JsonifiedValue<U>, JsonifiedValue<V>>
                    : T extends AsyncGenerator<infer U, infer V> ? AsyncGenerator<JsonifiedValue<U>, JsonifiedValue<V>>
                      : T extends AsyncIteratorObject<infer U, infer V> ? AsyncIteratorObject<JsonifiedValue<U>, JsonifiedValue<V>>
                        : unknown
          : T extends object ? { [K in keyof T]: JsonifiedValue<T[K]> }
            : unknown

export type JsonifiedArray<T extends ReadonlyArray<unknown>> = T extends readonly []
  ? []
  : T extends readonly [infer U, ...infer V]
    ? [U extends undefined ? null : JsonifiedValue<U>, ...JsonifiedArray<V>]
    : T extends ReadonlyArray<infer U>
      ? Array<JsonifiedValue<U>>
      : unknown

export type JsonifiedClientError<T>
  = T extends ORPCError<infer UCode, infer UData>
    ? ORPCError<UCode, JsonifiedValue<UData>>
    : T

/**
 * Client type whose outputs and error data replace types JSON cannot represent with their JSON equivalents.
 *
 * @see {@link https://orpc.dev/docs/openapi/link | OpenAPI Link}
 */
export type JsonifiedClient<T extends AnyNestedClient>
  = T extends Client<infer UClientContext, infer UInput, infer UOutput, infer UError>
    ? Client<UClientContext, UInput, JsonifiedValue<UOutput>, JsonifiedClientError<UError>>
    : {
        [K in keyof T]: T[K] extends AnyNestedClient ? JsonifiedClient<T[K]> : T[K];
      }
