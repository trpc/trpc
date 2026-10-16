import type { AsyncIteratorClass } from '@orpc/shared'
import type { AnySchema, Schema } from './schema'
import { ORPCError, wrapAsyncIteratorPreservingEventMeta } from '@orpc/client'
import { isAsyncIteratorObject, ORPC_NAME } from '@orpc/shared'
import { ValidationError } from './error'

const ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS_SYMBOL = Symbol.for('ORPC_ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS')

export interface AsyncIteratorObjectSchemaDetails {
  yieldSchema: AnySchema
  returnSchema?: AnySchema
}

/**
 * Defines a schema for an AsyncIteratorObject, validating each yielded value
 * (and optionally the return value) with the given schemas.
 *
 * @see {@link https://orpc.dev/docs/async-iterator-object | AsyncIteratorObject (SSE)}
 */
export function asyncIteratorObject<TYieldIn, TYieldOut, TReturnIn = unknown, TReturnOut = unknown>(
  yieldSchema: Schema<TYieldIn, TYieldOut>,
  returnSchema?: Schema<TReturnIn, TReturnOut>,
): Schema<AsyncIteratorObject<TYieldIn, TReturnIn, void>, AsyncIteratorClass<TYieldOut, TReturnOut, void>> {
  return {
    '~standard': {
      [ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS_SYMBOL as any]: { yieldSchema, returnSchema } satisfies AsyncIteratorObjectSchemaDetails,
      vendor: ORPC_NAME,
      version: 1,
      validate(iterator) {
        if (!isAsyncIteratorObject(iterator)) {
          return { issues: [{ message: 'Expect AsyncIteratorObject', path: [] }] }
        }

        const mapped = wrapAsyncIteratorPreservingEventMeta(iterator, {
          async mapResult(result) {
            const schema = result.done ? returnSchema : yieldSchema

            if (!schema) {
              return result
            }

            const validated = await schema['~standard'].validate(result.value)

            if (validated.issues) {
              throw new ORPCError('ASYNC_ITERATOR_OBJECT_VALIDATION_FAILED', {
                message: 'AsyncIteratorObject validation failed',
                cause: new ValidationError({
                  issues: validated.issues,
                  message: 'AsyncIteratorObject validation failed',
                  invalidData: result.value,
                }),
              })
            }

            return { done: result.done, value: validated.value }
          },
        })

        return { value: mapped }
      },
    },
  }
}

export function getAsyncIteratorObjectSchemaDetails(schema: AnySchema | undefined): undefined | AsyncIteratorObjectSchemaDetails {
  if (schema === undefined) {
    return undefined
  }

  return (schema['~standard'] as any)[ASYNC_ITERATOR_OBJECT_SCHEMA_DETAILS_SYMBOL]
}
